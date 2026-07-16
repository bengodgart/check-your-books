// sample-data.js — a deliberately DIRTY synthetic bookkeeping export.
//
// The point of the tool: real exported books are never clean. This file builds a
// believable invoice export with a fixed set of the quality problems that make a
// book untrustworthy (duplicates, an amount that is clearly a typo, broken client
// references, contradictory statuses, impossible dates, inconsistent formats), so
// the auditor has something real to find. DEMO mode ships canned finding text; the
// DETECTION is real deterministic code, so nothing about the DEMO is faked.
//
// Nothing here is real. It is generated from a fixed seed so screenshots are stable.

// ---- deterministic PRNG so the dataset never shifts between loads ----
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260715);
const pad = (n) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The valid client roster. A client name not on this list is a broken reference.
export const CLIENTS = [
  'Northwind Cafe', 'Harborview Dental', 'Peak Roofing Co', 'Lumen Yoga Studio',
  'Riverside Law Group', 'GreenLeaf Landscaping', 'Bright Smile Orthodontics',
  'Cobalt Consulting', 'Maple & Vine Florist', 'Summit Physical Therapy',
];

// The messy headers of the export the auditor reads.
export const SAMPLE_HEADERS = ['Invoice #', 'Client', 'Amount', 'Issue Date', 'Due Date', 'Status', 'Paid Date'];

// "Today" is fixed so overdue / future-date math stays stable across loads.
export const TODAY_ISO = '2026-07-15';
const TODAY = new Date(2026, 6, 15);

// Three date renderings, chosen by row so the file genuinely mixes formats.
function fmtDate(d, style) {
  const y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
  if (style === 0) return `${pad(m + 1)}/${pad(day)}/${y}`;   // 07/15/2026
  if (style === 1) return `${y}-${pad(m + 1)}-${pad(day)}`;   // 2026-07-15
  return `${MONTHS[m]} ${day} ${y}`;                          // Jul 15 2026
}
// Three amount renderings so the file genuinely mixes formats.
function fmtAmount(v, style) {
  if (style === 0) return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (style === 1) return v.toFixed(2);
  return String(Math.round(v));
}
// Raw status spellings grouped by meaning, so one canonical status has many faces.
const STATUS_RAW = {
  paid: ['Paid', 'PAID', 'paid', 'settled'],
  unpaid: ['Open', 'unpaid', 'pending'],
  overdue: ['Overdue', 'past due', 'late'],
};
const pickRaw = (bucket, i) => STATUS_RAW[bucket][i % STATUS_RAW[bucket].length];

const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const daysSince = (d) => Math.floor((TODAY - d) / 86400000);

// ---- build ~36 CLEAN, internally-consistent rows (6 months x 6) ----
function buildCleanRows() {
  const rows = [];
  let inv = 1001;
  for (let m = 5; m >= 0; m--) {
    for (let k = 0; k < 6; k++) {
      const style = (inv + k) % 3;
      const client = CLIENTS[Math.floor(rand() * CLIENTS.length)];
      const amount = Math.round((450 + rand() * 6350) * 100) / 100;
      // In the current month (m === 0), keep issue dates before "today" so no clean
      // row is accidentally future-dated; prior months can use the whole month.
      const maxDay = m === 0 ? 14 : 26;
      const day = 1 + Math.floor(rand() * maxDay);
      const issue = new Date(TODAY.getFullYear(), TODAY.getMonth() - m, day);
      const due = addDays(issue, 30);
      const age = daysSince(issue); // whole days between issue and "today"

      // Status kept consistent with the dates so clean rows NEVER contradict:
      // overdue only when past due, unpaid only when not yet due, and every paid
      // date is clamped to on or before "today".
      let bucket, paid = '';
      if (due < TODAY) {
        if (rand() < 0.8) {
          bucket = 'paid';
          const offset = Math.min(age - 1, 8 + Math.floor(rand() * 30));
          paid = fmtDate(addDays(issue, offset), style);
        } else {
          bucket = 'overdue';
        }
      } else {
        if (age > 6 && rand() < 0.3) {
          bucket = 'paid';
          const offset = 3 + Math.floor(rand() * (age - 3));
          paid = fmtDate(addDays(issue, offset), style);
        } else {
          bucket = 'unpaid';
        }
      }
      rows.push({
        'Invoice #': `INV-${inv}`,
        'Client': client,
        'Amount': fmtAmount(amount, style),
        'Issue Date': fmtDate(issue, style),
        'Due Date': fmtDate(due, style),
        'Status': pickRaw(bucket, inv),
        'Paid Date': paid,
      });
      inv++;
    }
  }
  return rows;
}

// ---- inject a fixed, documented set of defects ----
// Every entry here is one known-bad row (or a modification of a clean one) that the
// auditor must catch. The test asserts each of these is found.
function injectDefects(clean) {
  const rows = clean.slice();
  const byNo = (no) => rows.find((r) => r['Invoice #'] === no);

  // D1 — duplicate invoice number: INV-1010 re-entered, and re-keyed with a
  // DIFFERENT amount (the classic "same invoice, two totals" mess).
  const dup = { ...byNo('INV-1010') };
  dup['Amount'] = '$3,300.00';
  dup['Paid Date'] = '';
  dup['Status'] = 'Overdue'; // consistent with its own past-due dates; only the dup # is the issue
  rows.push(dup);

  // D2 — possible double billing: a NEW invoice number with the same client,
  // amount, and issue date as an existing one.
  const src = byNo('INV-1015');
  rows.push({
    'Invoice #': 'INV-1101',
    'Client': src['Client'],
    'Amount': src['Amount'],
    'Issue Date': src['Issue Date'],
    'Due Date': src['Due Date'],
    'Status': 'past due', // src is past its due date; overdue keeps this row self-consistent
    'Paid Date': '',
  });

  // D3 — amount outlier: a $2,500 invoice fat-fingered as $250,000.
  rows.push({
    'Invoice #': 'INV-1102', 'Client': 'Cobalt Consulting', 'Amount': '$250,000.00',
    'Issue Date': '2026-06-04', 'Due Date': '2026-07-04', 'Status': 'paid', 'Paid Date': '2026-06-20',
  });

  // D4 — missing required field: no client.
  rows.push({
    'Invoice #': 'INV-1103', 'Client': '', 'Amount': '1200.00',
    'Issue Date': '2026-07-02', 'Due Date': '2026-08-01', 'Status': 'Open', 'Paid Date': '',
  });
  // D5 — missing required field: no amount.
  rows.push({
    'Invoice #': 'INV-1104', 'Client': 'Lumen Yoga Studio', 'Amount': '',
    'Issue Date': '2026-07-03', 'Due Date': '2026-08-02', 'Status': 'Open', 'Paid Date': '',
  });

  // D6 — broken reference: client not on the roster.
  rows.push({
    'Invoice #': 'INV-1105', 'Client': 'Ghost Holdings LLC', 'Amount': '$980.00',
    'Issue Date': '2026-06-11', 'Due Date': '2026-07-11', 'Status': 'past due', 'Paid Date': '',
  });

  // D7 — date logic: paid BEFORE it was issued.
  rows.push({
    'Invoice #': 'INV-1106', 'Client': 'Peak Roofing Co', 'Amount': '$2,150.00',
    'Issue Date': '2026-06-10', 'Due Date': '2026-07-10', 'Status': 'Paid', 'Paid Date': '2026-05-01',
  });
  // D8 — date logic: due BEFORE it was issued.
  rows.push({
    'Invoice #': 'INV-1107', 'Client': 'Riverside Law Group', 'Amount': '$3,400.00',
    'Issue Date': '2026-06-15', 'Due Date': '2026-06-01', 'Status': 'Overdue', 'Paid Date': '',
  });

  // D9 — impossible future date: issued in 2027 (year typo).
  rows.push({
    'Invoice #': 'INV-1108', 'Client': 'Northwind Cafe', 'Amount': '$775.00',
    'Issue Date': '2027-03-01', 'Due Date': '2027-03-31', 'Status': 'Open', 'Paid Date': '',
  });

  // D10 — status contradiction: marked paid, but no paid date.
  rows.push({
    'Invoice #': 'INV-1109', 'Client': 'Harborview Dental', 'Amount': '$1,640.00',
    'Issue Date': '2026-05-05', 'Due Date': '2026-06-04', 'Status': 'Paid', 'Paid Date': '',
  });
  // D11 — status contradiction: marked unpaid, but has a paid date.
  rows.push({
    'Invoice #': 'INV-1110', 'Client': 'Summit Physical Therapy', 'Amount': '$2,900.00',
    'Issue Date': '2026-07-01', 'Due Date': '2026-07-31', 'Status': 'unpaid', 'Paid Date': '2026-07-08',
  });

  // D12 — unrecognized status value that maps to nothing.
  rows.push({
    'Invoice #': 'INV-1111', 'Client': 'Maple & Vine Florist', 'Amount': '$540.00',
    'Issue Date': '2026-06-22', 'Due Date': '2026-07-22', 'Status': 'PARTIAL', 'Paid Date': '',
  });

  return rows;
}

export const SAMPLE_ROWS = injectDefects(buildCleanRows());

// A CSV rendering of the sample, so the "upload a file" path can be exercised with
// the exact same data (and so the sample is copy-pasteable).
function csvEscape(s) {
  const str = String(s ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}
export const SAMPLE_CSV = [
  SAMPLE_HEADERS.map(csvEscape).join(','),
  ...SAMPLE_ROWS.map((r) => SAMPLE_HEADERS.map((h) => csvEscape(r[h])).join(',')),
].join('\n');
