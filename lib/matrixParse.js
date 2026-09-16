// lib/matrixParse.js — best-effort roster parsing for two shapes:
//
// 1) Simple: two columns, Date + Code — one person's own roster export.
// 2) Matrix: a real duty roster with many people — first column is a name,
//    the remaining columns are days of the month (or dates), one row per
//    person. This is the common shape for a printed/whole-team roster.
//
// Both CSV/Excel (structured cells) and OCR text (loose lines) are parsed
// into the same shape so the rest of the app doesn't care where rows came
// from: { mode: 'simple', rows } or { mode: 'matrix', people, columns }.

export function isoDateGuess(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/); // DD/MM/YYYY
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

function looksLikeDay(v) {
  const s = String(v).trim();
  return /^\d{1,2}$/.test(s) && Number(s) >= 1 && Number(s) <= 31;
}
function looksLikeDateish(v) {
  const s = String(v).trim();
  return isoDateGuess(s) !== null || /^\d{1,2}[\/\-]\d{1,2}$/.test(s);
}
function looksLikeName(v) {
  const s = String(v).trim();
  return s.length >= 2 && /[A-Za-z]/.test(s) && !/^\d+$/.test(s);
}

// ---- CSV / Excel (array-of-arrays input, e.g. XLSX.utils.sheet_to_json(sheet,{header:1}) ) ----
export function parseGrid(rows2D, validCodes) {
  const rows = rows2D.filter((r) => r && r.some((c) => String(c ?? '').trim() !== ''));
  if (rows.length === 0) return { mode: 'simple', rows: [] };

  const header = rows[0].map((c) => String(c ?? '').trim());
  const headerLower = header.map((h) => h.toLowerCase());

  // Shape A: exactly "Date" + "Code" style columns → single person.
  const dateIdx = headerLower.findIndex((h) => h === 'date');
  const codeIdx = headerLower.findIndex((h) => h === 'code');
  if (dateIdx !== -1 && codeIdx !== -1 && header.length <= 4) {
    const simpleRows = rows.slice(1).map((r) => {
      const date = isoDateGuess(r[dateIdx]);
      const code = String(r[codeIdx] ?? '').trim().toUpperCase();
      return { date, code, valid: !!date && validCodes.includes(code), source: 'import' };
    });
    return { mode: 'simple', rows: simpleRows };
  }

  // Shape B: matrix — first column = name, rest = day-of-month or date columns.
  const dayCols = header.slice(1);
  const dayLikeCount = dayCols.filter((h) => looksLikeDay(h) || looksLikeDateish(h)).length;
  if (dayLikeCount >= Math.max(3, dayCols.length * 0.5)) {
    const columns = dayCols.map((h, i) => ({ index: i + 1, header: h, iso: looksLikeDateish(h) ? isoDateGuess(h) : null }));
    const people = rows
      .slice(1)
      .filter((r) => looksLikeName(r[0]))
      .map((r) => ({
        name: String(r[0]).trim(),
        cells: columns.map((col) => ({ ...col, code: String(r[col.index] ?? '').trim().toUpperCase() })),
      }));
    return { mode: 'matrix', columns, people };
  }

  // Fallback: try to guess Date/Code are just the first two columns.
  const simpleRows = rows.slice(1).map((r) => {
    const date = isoDateGuess(r[0]);
    const code = String(r[1] ?? '').trim().toUpperCase();
    return { date, code, valid: !!date && validCodes.includes(code), source: 'import' };
  });
  return { mode: 'simple', rows: simpleRows };
}

// ---- OCR text (loose lines from Tesseract) ----
export function parseOcrText(text, validCodes) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const codePattern = validCodes.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');

  // Try matrix shape first: "Name Surname  M M O N N O ..."
  const matrixRe = new RegExp(`^([A-Za-z][A-Za-z.'-]*(?:\\s+[A-Za-z][A-Za-z.'-]*){0,3})\\s+((?:(?:${codePattern})\\s*){3,})$`, 'i');
  const matrixPeople = [];
  for (const line of lines) {
    const m = line.match(matrixRe);
    if (m) {
      const name = m[1].trim();
      const codes = m[2].trim().split(/\s+/).map((c) => c.toUpperCase());
      matrixPeople.push({ name, cells: codes.map((code, i) => ({ index: i + 1, header: String(i + 1), iso: null, code })) });
    }
  }
  if (matrixPeople.length >= 2) {
    const maxCols = Math.max(...matrixPeople.map((p) => p.cells.length));
    const columns = Array.from({ length: maxCols }, (_, i) => ({ index: i + 1, header: String(i + 1), iso: null }));
    return { mode: 'matrix', columns, people: matrixPeople };
  }

  // Fallback: single-person "day  code" lines, e.g. "01  M", "3: N".
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const singleRe = new RegExp(`\\b(\\d{1,2})\\b[^A-Za-z0-9]{0,3}\\b(${codePattern})\\b`, 'i');
  const rows = [];
  for (const line of lines) {
    const m = line.match(singleRe);
    if (m) {
      const day = Number(m[1]);
      if (day >= 1 && day <= daysInMonth) {
        const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        rows.push({ date, code: m[2].toUpperCase(), valid: true, source: 'ocr' });
      }
    }
  }
  return { mode: 'simple', rows };
}

// Turn one selected person's matrix cells into date/code rows the review
// screen understands, using a chosen month when columns are day-numbers.
export function personCellsToRows(person, { year, month }, validCodes) {
  return person.cells
    .filter((c) => c.code)
    .map((c) => {
      let date = c.iso;
      if (!date) {
        const day = Number(c.header);
        if (!day || day < 1 || day > 31) return null;
        const daysInMonth = new Date(year, month, 0).getDate();
        if (day > daysInMonth) return null;
        date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
      return { date, code: c.code, valid: validCodes.includes(c.code), source: 'import' };
    })
    .filter(Boolean);
}
