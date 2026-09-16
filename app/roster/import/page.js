'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, setSetting } from '../../../lib/db';
import { rescheduleAll } from '../../../lib/notify';
import { parseGrid, parseOcrText, personCellsToRows } from '../../../lib/matrixParse';
import { useModal } from '../../../context/ModalContext';

const now = new Date();
const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

export default function ImportPage() {
  const { openPersonPicker } = useModal();
  const validCodes = useLiveQuery(async () => (db ? (await db.shiftTypes.toArray()).map((s) => s.code) : []), [], []);

  const [tab, setTab] = useState('file');
  const [ocrProgress, setOcrProgress] = useState('');
  const [pendingMatrix, setPendingMatrix] = useState(null); // { person, needsMonth }
  const [month, setMonth] = useState(defaultMonth);
  const [reviewRows, setReviewRows] = useState(null);
  const [summary, setSummary] = useState('');

  function startFromParseResult(result, sourceLabel) {
    if (result.mode === 'simple') {
      if (result.rows.length === 0) {
        alert("Couldn't find any recognisable roster rows there. Try the other import method, or enter manually.");
        return;
      }
      setSummary(`Parsed ${result.rows.length} rows from ${sourceLabel}.`);
      setReviewRows(result.rows);
      return;
    }
    // matrix mode — many people
    const names = [...new Set(result.people.map((p) => p.name))];
    if (names.length === 0) {
      alert("Couldn't detect any names or shift codes there. Try the other import method, or enter manually.");
      return;
    }
    if (names.length === 1) {
      beginPersonSelection(result.people[0], result);
      return;
    }
    openPersonPicker(names, (chosenName) => {
      const person = result.people.find((p) => p.name === chosenName) || { name: chosenName, cells: result.people[0]?.cells.map((c) => ({ ...c, code: '' })) || [] };
      beginPersonSelection(person, result);
    });
  }

  function beginPersonSelection(person, result) {
    const needsMonth = person.cells.some((c) => !c.iso);
    setPendingMatrix({ person, needsMonth, columns: result.columns });
    if (!needsMonth) {
      finalizeMatrix(person, null);
    }
  }

  async function finalizeMatrix(person, monthValue) {
    const [y, m] = (monthValue || month).split('-').map(Number);
    const rows = personCellsToRows(person, { year: y, month: m }, validCodes);
    if (rows.length === 0) {
      alert("Couldn't line up any days for that person. Try picking a different month, or use manual entry.");
      return;
    }
    await setSetting('activePersonName', person.name);
    const known = await db.settings.get('lastImportPeople');
    const names = new Set(known?.value || []);
    names.add(person.name);
    await setSetting('lastImportPeople', [...names]);

    setSummary(`Importing ${rows.length} shifts for ${person.name}. Check every row below before saving.`);
    setReviewRows(rows);
    setPendingMatrix(null);
  }

  async function handleFile(file) {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'csv') {
      const Papa = (await import('papaparse')).default;
      Papa.parse(file, {
        skipEmptyLines: true,
        complete: (res) => startFromParseResult(parseGrid(res.data, validCodes), file.name),
      });
    } else {
      const mod = await import('xlsx');
      const XLSX = mod.default || mod;
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows2D = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      startFromParseResult(parseGrid(rows2D, validCodes), file.name);
    }
  }

  async function handleImage(file) {
    if (!file) return;
    setOcrProgress('Loading OCR engine…');
    try {
      const Tesseract = (await import('tesseract.js')).default;
      const { data } = await Tesseract.recognize(file, 'eng', {
        logger: (m) => {
          if (m.status && m.progress != null) setOcrProgress(`${m.status} — ${Math.round(m.progress * 100)}%`);
        },
      });
      setOcrProgress('');
      startFromParseResult(parseOcrText(data.text, validCodes), 'the photo');
    } catch (err) {
      setOcrProgress('');
      alert('OCR failed: ' + err.message + '. Check your connection (the OCR engine loads from the network the first time) and try again.');
    }
  }

  function editRow(i, field, value) {
    setReviewRows((rows) => {
      const next = [...rows];
      next[i] = { ...next[i], [field]: value };
      next[i].valid = !!next[i].date && validCodes.includes(next[i].code);
      return next;
    });
  }

  async function confirmImport() {
    const valid = reviewRows.filter((r) => r.valid);
    for (const r of valid) {
      const existing = await db.roster.where('date').equals(r.date).first();
      const row = { date: r.date, code: r.code, source: r.source };
      if (existing) await db.roster.update(existing.id, row);
      else await db.roster.add(row);
    }
    await rescheduleAll();
    alert(`Imported ${valid.length} roster entries.`);
    setReviewRows(null);
    setSummary('');
  }

  const okCount = reviewRows ? reviewRows.filter((r) => r.valid).length : 0;

  return (
    <section className="page">
      <header className="page-head"><h1>Import roster</h1></header>

      {!pendingMatrix && !reviewRows && (
        <>
          <div className="tabs">
            <button className={`tab-btn ${tab === 'file' ? 'active' : ''}`} onClick={() => setTab('file')}>Excel / CSV</button>
            <button className={`tab-btn ${tab === 'ocr' ? 'active' : ''}`} onClick={() => setTab('ocr')}>Photo / screenshot (OCR)</button>
          </div>

          {tab === 'file' ? (
            <div>
              <p className="muted-note">
                Works with a personal export (<code>Date</code>, <code>Code</code> columns), or a whole-team roster
                (one row per person, one column per day) — you'll be asked which row is yours.
              </p>
              <label className="btn file-btn">Choose file<input type="file" accept=".csv,.xlsx,.xls" hidden onChange={(e) => handleFile(e.target.files[0])} /></label>
              <br />
              <a
                href="data:text/csv;charset=utf-8,Date%2CCode%0A2026-09-01%2CM%0A2026-09-02%2CM%0A2026-09-03%2CO"
                download="dutyroster-template.csv"
                className="link-note"
              >
                Download a CSV template
              </a>
            </div>
          ) : (
            <div>
              <p className="muted-note">
                Upload a photo or screenshot of a written/printed roster — including a whole-team roster with many
                names. Text is read on-device with OCR; always review the detected rows, and pick your own name if
                several people are listed.
              </p>
              <label className="btn file-btn">Choose image<input type="file" accept="image/*" hidden onChange={(e) => handleImage(e.target.files[0])} /></label>
              {ocrProgress && <p className="muted-note">{ocrProgress}</p>}
            </div>
          )}
        </>
      )}

      {pendingMatrix?.needsMonth && (
        <div className="panel">
          <h2>Which month is this?</h2>
          <p className="muted-note">The roster only lists day numbers, so pick the month it belongs to for {pendingMatrix.person.name}.</p>
          <label>Month <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
          <div className="modal-actions">
            <button className="btn" onClick={() => setPendingMatrix(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={() => finalizeMatrix(pendingMatrix.person, month)}>Continue</button>
          </div>
        </div>
      )}

      {reviewRows && (
        <div>
          <h2 className="section-title">Review before importing</h2>
          <p className="muted-note">{summary} — {okCount} of {reviewRows.length} rows look valid.</p>
          <div className="review-table">
            <div className="review-row review-head"><span>Date</span><span>Code</span><span>Status</span></div>
            {reviewRows.map((r, i) => (
              <div className={`review-row ${r.valid ? '' : 'row-bad'}`} key={i}>
                <input type="date" value={r.date || ''} onChange={(e) => editRow(i, 'date', e.target.value)} />
                <select value={r.code || ''} onChange={(e) => editRow(i, 'code', e.target.value)}>
                  <option value="">—</option>
                  {validCodes.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <span>{r.valid ? '✓ ok' : '⚠ check'}</span>
              </div>
            ))}
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={() => { setReviewRows(null); setSummary(''); }}>Discard</button>
            <button className="btn btn-primary" onClick={confirmImport}>Import these entries</button>
          </div>
        </div>
      )}
    </section>
  );
}
