import { db } from '../db.js';
import { rescheduleAll } from '../notify.js';

let parsedRows = []; // {date, code, valid}

export async function renderImport(root) {
  const validCodes = (await db.shiftTypes.toArray()).map(s => s.code);
  parsedRows = [];

  root.innerHTML = `
    <section class="page">
      <header class="page-head"><h1>Import roster</h1></header>

      <div class="tabs">
        <button class="tab-btn active" data-tab="file">Excel / CSV</button>
        <button class="tab-btn" data-tab="ocr">Photo / screenshot (OCR)</button>
      </div>

      <div class="tab-panel" id="tab-file">
        <p class="muted-note">Columns needed: <code>Date</code> (YYYY-MM-DD) and <code>Code</code> (${validCodes.join('/')}). First row should be headers.</p>
        <label class="btn file-btn">Choose file<input type="file" id="file-input" accept=".csv,.xlsx,.xls" hidden></label>
        <a href="data:text/csv;charset=utf-8,Date%2CCode%0A2026-09-01%2CM%0A2026-09-02%2CM%0A2026-09-03%2CO" download="dutyroster-template.csv" class="link-note">Download a CSV template</a>
      </div>

      <div class="tab-panel hidden" id="tab-ocr">
        <p class="muted-note">Upload a photo or screenshot of a written/printed roster. Text is read on-device using OCR; always review the detected days before importing — handwriting and low-quality photos can be misread.</p>
        <label class="btn file-btn">Choose image<input type="file" id="ocr-input" accept="image/*" hidden></label>
        <div id="ocr-progress" class="muted-note hidden"></div>
      </div>

      <div id="review-wrap" class="hidden">
        <h2 class="section-title">Review before importing</h2>
        <p class="muted-note" id="review-summary"></p>
        <div class="review-table" id="review-table"></div>
        <div class="modal-actions">
          <button class="btn" id="review-cancel">Discard</button>
          <button class="btn btn-primary" id="review-confirm">Import these entries</button>
        </div>
      </div>
    </section>
  `;

  root.querySelectorAll('.tab-btn').forEach(btn => btn.onclick = () => {
    root.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    root.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    root.querySelector(`#tab-${btn.dataset.tab}`).classList.remove('hidden');
    root.querySelector('#review-wrap').classList.add('hidden');
  });

  root.querySelector('#file-input').onchange = (e) => handleFile(e.target.files[0], validCodes, root);
  root.querySelector('#ocr-input').onchange = (e) => handleImage(e.target.files[0], validCodes, root);

  root.querySelector('#review-cancel').onclick = () => {
    parsedRows = [];
    root.querySelector('#review-wrap').classList.add('hidden');
  };
  root.querySelector('#review-confirm').onclick = async () => {
    const valid = parsedRows.filter(r => r.valid);
    for (const r of valid) {
      const existing = await db.roster.where('date').equals(r.date).first();
      const row = { date: r.date, code: r.code, source: r.source };
      if (existing) await db.roster.update(existing.id, row); else await db.roster.add(row);
    }
    await rescheduleAll();
    alert(`Imported ${valid.length} roster entries.`);
    root.querySelector('#review-wrap').classList.add('hidden');
    parsedRows = [];
  };
}

function isoDateGuess(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/); // DD/MM/YYYY
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

function showReview(rows, validCodes, root, summaryText) {
  parsedRows = rows;
  root.querySelector('#review-wrap').classList.remove('hidden');
  root.querySelector('#review-summary').textContent = summaryText;
  const okCount = rows.filter(r => r.valid).length;
  root.querySelector('#review-table').innerHTML = `
    <div class="review-row review-head"><span>Date</span><span>Code</span><span>Status</span></div>
    ${rows.map((r, i) => `
      <div class="review-row ${r.valid ? '' : 'row-bad'}">
        <input type="date" data-i="${i}" data-f="date" value="${r.date || ''}">
        <select data-i="${i}" data-f="code">
          <option value="">—</option>
          ${validCodes.map(c => `<option value="${c}" ${r.code === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
        <span>${r.valid ? '✓ ok' : '⚠ check'}</span>
      </div>`).join('')}
  `;
  root.querySelectorAll('#review-table [data-f]').forEach(inp => {
    inp.onchange = () => {
      const i = Number(inp.dataset.i);
      const f = inp.dataset.f;
      parsedRows[i][f] = inp.value;
      parsedRows[i].valid = !!parsedRows[i].date && validCodes.includes(parsedRows[i].code);
      inp.closest('.review-row').classList.toggle('row-bad', !parsedRows[i].valid);
    };
  });
  root.querySelector('#review-summary').textContent = `${okCount} of ${rows.length} rows look valid. Fix flagged rows below, or they'll be skipped.`;
}

// ---- CSV / Excel ----
function handleFile(file, validCodes, root) {
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'csv') {
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (res) => processRows(res.data.map(r => ({
        date: isoDateGuess(r.Date || r.date), code: (r.Code || r.code || '').toString().trim().toUpperCase()
      })), validCodes, root, `Parsed ${res.data.length} rows from ${file.name}.`)
    });
  } else {
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      processRows(data.map(r => ({
        date: isoDateGuess(r.Date || r.date), code: (r.Code || r.code || '').toString().trim().toUpperCase()
      })), validCodes, root, `Parsed ${data.length} rows from ${file.name}.`);
    };
    reader.readAsArrayBuffer(file);
  }
}

function processRows(rows, validCodes, root, summary) {
  const cleaned = rows
    .filter(r => r.date || r.code)
    .map(r => ({ ...r, valid: !!r.date && validCodes.includes(r.code), source: 'import' }));
  showReview(cleaned, validCodes, root, summary);
}

// ---- OCR ----
async function handleImage(file, validCodes, root) {
  if (!file) return;
  const progress = root.querySelector('#ocr-progress');
  progress.classList.remove('hidden');
  progress.textContent = 'Loading OCR engine…';
  try {
    const { data } = await Tesseract.recognize(file, 'eng', {
      logger: (m) => {
        if (m.status && m.progress != null) {
          progress.textContent = `${m.status} — ${Math.round(m.progress * 100)}%`;
        }
      }
    });
    progress.textContent = 'Reading detected text…';
    const rows = extractRosterFromText(data.text, validCodes);
    progress.classList.add('hidden');
    if (rows.length === 0) {
      alert("Couldn't detect any date + code pairs in that image. Try a clearer photo, or use Excel/CSV import instead.");
      return;
    }
    showReview(rows, validCodes, root, `Detected ${rows.length} possible entries from the image — check each one carefully.`);
  } catch (err) {
    progress.classList.add('hidden');
    alert('OCR failed: ' + err.message + '. Check your connection (the OCR engine loads from the network the first time) and try again.');
  }
}

// Best-effort text parser: looks for a day-of-month (1-31) followed by a known
// shift code on the same line, e.g. "01  M", "3: N", "12 - O". This is the
// pattern used by most tabular rosters. The current viewed month is assumed;
// the review step lets the user fix any date.
function extractRosterFromText(text, validCodes) {
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const rows = [];
  const codePattern = validCodes.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const re = new RegExp(`\\b(\\d{1,2})\\b[^A-Za-z0-9]{0,3}\\b(${codePattern})\\b`, 'i');
  for (const line of lines) {
    const m = line.match(re);
    if (m) {
      const day = Number(m[1]);
      if (day >= 1 && day <= 31) {
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        if (day <= daysInMonth) {
          const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          rows.push({ date, code: m[2].toUpperCase(), valid: true, source: 'ocr' });
        }
      }
    }
  }
  return rows;
}
