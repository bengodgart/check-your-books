// Node smoke test for the kernel: parse the dirty sample, run the auditor in DEMO
// mode, and confirm every planted defect is caught with the right rows.
// Run from the repo root:  node test-node.mjs

// Shim the one browser global the auditor touches (localStorage, for the API key).
const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};

const { parseCsv } = await import('./csv.js');
const { SAMPLE_CSV, CLIENTS } = await import('./sample-data.js');
const { auditRows, resolveColumns } = await import('./audit.js');

let failures = 0;
const check = (cond, msg) => { if (cond) { console.log(`  OK  ${msg}`); } else { console.error(`  FAIL ${msg}`); failures++; } };

// Parse the sample through the same CSV reader the upload path uses.
const { headers, rows } = parseCsv(SAMPLE_CSV);
const cols = resolveColumns(headers);
console.log(`parsed ${rows.length} rows; columns:`, cols);
check(rows.length >= 40, `read at least 40 rows (got ${rows.length})`);
check(
  cols.invoiceNo && cols.client && cols.amount && cols.issueDate && cols.dueDate && cols.status && cols.paidDate,
  'resolved all seven columns from the messy headers'
);

const report = await auditRows(rows, cols, CLIENTS);
console.log(`\naudit source: ${report.source}, trust score: ${report.summary.trustScore}`);
console.log('findings:', report.findings.map((f) => `${f.category}(${f.severity},${f.rows.length})`).join('  '));

check(report.source === 'demo', 'runs in DEMO mode with no API key');

// Every planted defect must produce its category. The map value is the expected
// number of offending rows (null = file-level finding, rows not row-specific).
const EXPECTED = {
  missing_required_field: 2,
  duplicate_invoice_number: 2,
  possible_double_billing: 2,
  amount_outlier: 1,
  unknown_client_reference: 1,
  date_logic_error: 2,
  future_date: 1,
  status_contradiction: 2,
  unrecognized_status: 1,
  inconsistent_date_format: null,
  inconsistent_amount_format: null,
  inconsistent_status_values: null,
};
const found = new Map(report.findings.map((f) => [f.category, f]));

console.log('\n--- expected findings ---');
for (const [cat, expectRows] of Object.entries(EXPECTED)) {
  const f = found.get(cat);
  if (!f) { console.error(`  FAIL missing finding: ${cat}`); failures++; continue; }
  if (expectRows === null) {
    check(f.rows.length === 0, `${cat}: file-level finding`);
  } else {
    check(f.rows.length === expectRows, `${cat}: ${f.rows.length} row(s) (expected ${expectRows})`);
  }
  // Narrative must be present and copy-clean.
  const text = `${f.title} ${f.detail} ${f.recommendation}`;
  if (!f.title || !f.detail || !f.recommendation) { console.error(`  FAIL ${cat}: empty narrative`); failures++; }
  if (text.includes('—')) { console.error(`  FAIL ${cat}: contains an em-dash`); failures++; }
}

check(report.findings.length === Object.keys(EXPECTED).length,
  `exactly ${Object.keys(EXPECTED).length} findings (got ${report.findings.length})`);

// Specific offending invoices, so the wiring is proven not just counted.
const inv = (cat) => (found.get(cat)?.rows || []).map((r) => r.invoiceNo).sort();
check(JSON.stringify(inv('amount_outlier')) === JSON.stringify(['INV-1102']), 'the $250,000 typo is the outlier (INV-1102)');
check(inv('unknown_client_reference').includes('INV-1105'), 'the ghost client is caught (INV-1105)');
check(inv('duplicate_invoice_number').filter((x) => x === 'INV-1010').length === 2, 'both INV-1010 rows are flagged as duplicates');
check(inv('unrecognized_status').includes('INV-1111'), 'the PARTIAL status is caught (INV-1111)');

// Sanity on the summary block.
check(report.summary.rowsChecked === rows.length, 'summary.rowsChecked matches the input');
check(report.summary.trustScore > 0 && report.summary.trustScore < 100, `trust score is a believable ${report.summary.trustScore}/100`);
check(report.summary.bySeverity.high >= 5, `flags several high-severity issues (${report.summary.bySeverity.high})`);

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
process.exit(failures === 0 ? 0 : 1);
