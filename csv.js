// csv.js — a tiny, dependency-free CSV reader for the upload path.
// Handles quoted fields, embedded commas, doubled "" quotes, and \r\n or \n
// line endings. Returns { headers, rows } where each row is an object keyed by
// the header text exactly as it appears in the file.

export function parseCsv(text) {
  const src = String(text || '').replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  if (!src.trim()) return { headers: [], rows: [] };

  const records = [];
  let field = '';
  let record = [];
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }  // escaped quote
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      record.push(field); field = '';
    } else if (ch === '\n') {
      record.push(field); field = '';
      records.push(record); record = [];
    } else {
      field += ch;
    }
  }
  record.push(field);
  records.push(record);

  const headers = (records.shift() || []).map((h) => h.trim());
  const rows = records
    .filter((r) => r.some((c) => String(c).trim() !== ''))  // drop blank lines
    .map((r) => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = r[i] !== undefined ? r[i] : ''; });
      return obj;
    });
  return { headers, rows };
}

// Distinct non-empty raw values in a column, capped, for previews and mapping.
export function distinctValues(rows, header, cap = 40) {
  const seen = new Set();
  for (const r of rows) {
    const v = String(r[header] ?? '').trim();
    if (v) seen.add(v);
    if (seen.size >= cap) break;
  }
  return [...seen];
}
