// audit.js — the data-quality auditor. Given exported invoice rows, it finds the
// things that make a book untrustworthy and returns a ranked report.
//
// Two layers, on purpose:
//   1. DETECTION is deterministic code (below). It never needs a key and never
//      guesses, so the DEMO is completely honest: the duplicates, outliers, broken
//      references, contradictions, and bad dates it reports are really there.
//   2. The NARRATIVE (the plain-English title, explanation, and fix for each finding)
//      is where the AI helps. DEMO mode ships prepared narrative; LIVE mode asks
//      Claude to write it and to weigh in on severity, using your own API key,
//      straight from the browser.

export const MODEL = 'claude-opus-4-8'; // cheaper option: 'claude-haiku-4-5'
const KEY_STORE = 'cyb_anthropic_key';

export function getApiKey() { return localStorage.getItem(KEY_STORE) || ''; }
export function setApiKey(k) {
  if (k) localStorage.setItem(KEY_STORE, k.trim());
  else localStorage.removeItem(KEY_STORE);
}
export function hasApiKey() { return !!getApiKey(); }

const TODAY = new Date(2026, 6, 15); // fixed "today" so audits are reproducible

// ---------------------------------------------------------------------------
// Parsing helpers. Each returns the parsed value AND which format it saw, so the
// consistency checks can tell that a column mixes formats.
// ---------------------------------------------------------------------------

export function parseAmount(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return { value: null, fmt: null };
  const hadSymbol = /[$,]/.test(s);
  const cleaned = s.replace(/[$,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return { value: null, fmt: 'unparseable' };
  const value = Number(cleaned);
  let fmt;
  if (hadSymbol) fmt = 'symbol';           // $1,200.00
  else if (cleaned.includes('.')) fmt = 'decimal'; // 1200.00
  else fmt = 'integer';                     // 1200
  return { value, fmt };
}

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

export function parseDate(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return { date: null, iso: null, fmt: null };
  let m;
  // MM/DD/YYYY
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) {
    return finishDate(+m[3], +m[1] - 1, +m[2], 'us');
  }
  // YYYY-MM-DD
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
    return finishDate(+m[1], +m[2] - 1, +m[3], 'iso');
  }
  // Mon D YYYY  (e.g. Jul 15 2026)
  if ((m = s.match(/^([A-Za-z]{3,}) (\d{1,2}) (\d{4})$/))) {
    const mo = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (mo !== undefined) return finishDate(+m[3], mo, +m[2], 'text');
  }
  return { date: null, iso: null, fmt: 'unparseable' };
}
function finishDate(y, mo, d, fmt) {
  const date = new Date(y, mo, d);
  // Reject impossible calendar dates (e.g. 02/30) that Date silently rolls over.
  if (date.getFullYear() !== y || date.getMonth() !== mo || date.getDate() !== d) {
    return { date: null, iso: null, fmt: 'invalid' };
  }
  const iso = `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return { date, iso, fmt };
}

const STATUS_MAP = {
  paid: 'paid', PAID: 'paid', settled: 'paid', complete: 'paid', y: 'paid',
  open: 'unpaid', unpaid: 'unpaid', pending: 'unpaid', n: 'unpaid', 'awaiting payment': 'unpaid',
  overdue: 'overdue', 'past due': 'overdue', late: 'overdue',
};
export function normalizeStatus(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return { canonical: null, raw: '' };
  return { canonical: STATUS_MAP[s.toLowerCase()] || null, raw: s };
}

// ---------------------------------------------------------------------------
// Column resolution: match the export's headers to the fields we audit. Works on
// the sample's headers and tolerates common variants on an uploaded file.
// ---------------------------------------------------------------------------
const COLUMN_PATTERNS = [
  ['invoiceNo', /invoice\s*#|invoice\s*(no|number|num)|^inv\b|(^|\W)id(\W|$)/i],
  ['paidDate', /paid/i],       // check "paid date" before generic "date"
  ['dueDate', /due/i],
  ['issueDate', /issue|invoice\s*date|date\s*sent|created|^date$/i],
  ['status', /status|state/i],
  ['amount', /amount|total|value|price|balance/i],
  ['client', /client|customer|account|payer|name/i],
];
export function resolveColumns(headers) {
  const map = {};
  const used = new Set();
  for (const [field, re] of COLUMN_PATTERNS) {
    const hit = headers.find((h) => !used.has(h) && re.test(h));
    if (hit) { map[field] = hit; used.add(hit); }
  }
  return map;
}

// Turn raw export rows into normalized records the rules operate on.
export function normalizeRows(rows, cols) {
  return rows.map((r, i) => {
    const g = (field) => (cols[field] ? r[cols[field]] : '');
    return {
      line: i + 1, // 1-based data row (header excluded)
      invoiceNo: String(g('invoiceNo') ?? '').trim(),
      client: String(g('client') ?? '').trim(),
      amount: parseAmount(g('amount')),
      issue: parseDate(g('issueDate')),
      due: parseDate(g('dueDate')),
      paid: parseDate(g('paidDate')),
      status: normalizeStatus(g('status')),
    };
  });
}

// ---------------------------------------------------------------------------
// DETECTION. Each rule returns machine facts + the offending rows. No prose here.
// ---------------------------------------------------------------------------
const SEV = { high: 3, medium: 2, low: 1 };

function median(nums) {
  if (!nums.length) return 0;
  const a = [...nums].sort((x, y) => x - y);
  const mid = a.length >> 1;
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

export function detectIssues(records, clients) {
  const findings = [];
  const roster = new Set(clients.map((c) => c.trim().toLowerCase()));
  const ref = (rs) => rs.map((r) => ({ line: r.line, invoiceNo: r.invoiceNo || '(blank)' }));

  // 1. Missing required fields.
  const missing = [];
  for (const r of records) {
    const gaps = [];
    if (!r.invoiceNo) gaps.push('invoice number');
    if (!r.client) gaps.push('client');
    if (r.amount.value === null) gaps.push('amount');
    if (!r.issue.iso) gaps.push('issue date');
    if (gaps.length) missing.push({ r, gaps });
  }
  if (missing.length) {
    findings.push({
      category: 'missing_required_field', severity: 'high',
      rows: ref(missing.map((x) => x.r)),
      facts: { details: missing.map((x) => ({ line: x.r.line, invoiceNo: x.r.invoiceNo || '(blank)', missing: x.gaps })) },
    });
  }

  // 2. Duplicate invoice numbers.
  const byNo = new Map();
  for (const r of records) {
    if (!r.invoiceNo) continue;
    const k = r.invoiceNo.toLowerCase();
    (byNo.get(k) || byNo.set(k, []).get(k)).push(r);
  }
  const dupGroups = [...byNo.values()].filter((g) => g.length > 1);
  if (dupGroups.length) {
    findings.push({
      category: 'duplicate_invoice_number', severity: 'high',
      rows: ref(dupGroups.flat()),
      facts: {
        groups: dupGroups.map((g) => ({
          invoiceNo: g[0].invoiceNo,
          lines: g.map((r) => r.line),
          amountsDiffer: new Set(g.map((r) => r.amount.value)).size > 1,
        })),
      },
    });
  }

  // 3. Possible double billing: same client + amount + issue date, different invoice #.
  const byTriple = new Map();
  for (const r of records) {
    if (!r.client || r.amount.value === null || !r.issue.iso) continue;
    const k = `${r.client.toLowerCase()}|${r.amount.value}|${r.issue.iso}`;
    (byTriple.get(k) || byTriple.set(k, []).get(k)).push(r);
  }
  const dblGroups = [...byTriple.values()].filter(
    (g) => g.length > 1 && new Set(g.map((r) => r.invoiceNo.toLowerCase())).size > 1
  );
  if (dblGroups.length) {
    findings.push({
      category: 'possible_double_billing', severity: 'high',
      rows: ref(dblGroups.flat()),
      facts: {
        groups: dblGroups.map((g) => ({
          client: g[0].client,
          amount: g[0].amount.value,
          issueDate: g[0].issue.iso,
          invoices: g.map((r) => r.invoiceNo),
        })),
      },
    });
  }

  // 4. Amount outliers (robust: ratio to the median invoice).
  const amounts = records.map((r) => r.amount.value).filter((v) => v !== null && v > 0);
  if (amounts.length >= 5) {
    const med = median(amounts);
    const out = records.filter((r) => {
      const v = r.amount.value;
      return v !== null && v > 0 && med > 0 && (v > med * 12 || v < med / 40);
    });
    if (out.length) {
      findings.push({
        category: 'amount_outlier', severity: 'high',
        rows: ref(out),
        facts: {
          median: Math.round(med * 100) / 100,
          items: out.map((r) => ({ line: r.line, invoiceNo: r.invoiceNo, amount: r.amount.value, timesMedian: Math.round(r.amount.value / med) })),
        },
      });
    }
  }

  // 5. Broken client references (client not on the roster).
  const unknown = records.filter((r) => r.client && !roster.has(r.client.toLowerCase()));
  if (unknown.length) {
    findings.push({
      category: 'unknown_client_reference', severity: 'high',
      rows: ref(unknown),
      facts: { items: unknown.map((r) => ({ line: r.line, invoiceNo: r.invoiceNo, client: r.client })) },
    });
  }

  // 6. Date logic errors: paid before issued, or due before issued.
  const dateErr = [];
  for (const r of records) {
    const problems = [];
    if (r.issue.date && r.paid.date && r.paid.date < r.issue.date) problems.push('paid date is before the issue date');
    if (r.issue.date && r.due.date && r.due.date < r.issue.date) problems.push('due date is before the issue date');
    if (problems.length) dateErr.push({ r, problems });
  }
  if (dateErr.length) {
    findings.push({
      category: 'date_logic_error', severity: 'high',
      rows: ref(dateErr.map((x) => x.r)),
      facts: { items: dateErr.map((x) => ({ line: x.r.line, invoiceNo: x.r.invoiceNo, problems: x.problems })) },
    });
  }

  // 7. Impossible future dates (an invoice cannot be issued or paid in the future).
  const future = [];
  for (const r of records) {
    const which = [];
    if (r.issue.date && r.issue.date > TODAY) which.push(`issue date ${r.issue.iso}`);
    if (r.paid.date && r.paid.date > TODAY) which.push(`paid date ${r.paid.iso}`);
    if (which.length) future.push({ r, which });
  }
  if (future.length) {
    findings.push({
      category: 'future_date', severity: 'medium',
      rows: ref(future.map((x) => x.r)),
      facts: { items: future.map((x) => ({ line: x.r.line, invoiceNo: x.r.invoiceNo, fields: x.which })) },
    });
  }

  // 8. Status contradictions against the dates.
  const contra = [];
  for (const r of records) {
    const c = r.status.canonical;
    if (!c) continue;
    const why = [];
    if (c === 'paid' && !r.paid.iso) why.push('marked paid but has no paid date');
    if (c !== 'paid' && r.paid.iso) why.push(`marked ${c} but has a paid date`);
    if (c === 'overdue' && r.due.date && r.due.date >= TODAY) why.push('marked overdue but the due date has not passed');
    if (c === 'unpaid' && r.due.date && r.due.date < TODAY) why.push('marked unpaid but the due date has passed (should be overdue)');
    if (why.length) contra.push({ r, why });
  }
  if (contra.length) {
    findings.push({
      category: 'status_contradiction', severity: 'medium',
      rows: ref(contra.map((x) => x.r)),
      facts: { items: contra.map((x) => ({ line: x.r.line, invoiceNo: x.r.invoiceNo, status: x.r.status.raw, problems: x.why })) },
    });
  }

  // 9. Unrecognized status values (a status word that maps to nothing).
  const badStatus = records.filter((r) => r.status.raw && !r.status.canonical);
  if (badStatus.length) {
    findings.push({
      category: 'unrecognized_status', severity: 'medium',
      rows: ref(badStatus),
      facts: {
        values: [...new Set(badStatus.map((r) => r.status.raw))],
        items: badStatus.map((r) => ({ line: r.line, invoiceNo: r.invoiceNo, status: r.status.raw })),
      },
    });
  }

  // 10 + 11. Inconsistent date / amount formats across the file.
  const dateFmts = new Set();
  for (const r of records) for (const d of [r.issue, r.due, r.paid]) if (d.fmt && d.date) dateFmts.add(d.fmt);
  if (dateFmts.size > 1) {
    findings.push({
      category: 'inconsistent_date_format', severity: 'low', rows: [],
      facts: { formats: [...dateFmts].map(dateFmtLabel) },
    });
  }
  const amtFmts = new Set(records.map((r) => r.amount.fmt).filter((f) => f && f !== 'unparseable'));
  if (amtFmts.size > 1) {
    findings.push({
      category: 'inconsistent_amount_format', severity: 'low', rows: [],
      facts: { formats: [...amtFmts].map(amtFmtLabel) },
    });
  }

  // 12. Inconsistent status spellings: one meaning written many ways.
  const spellings = { paid: new Set(), unpaid: new Set(), overdue: new Set() };
  for (const r of records) if (r.status.canonical) spellings[r.status.canonical].add(r.status.raw);
  const mixed = Object.entries(spellings).filter(([, set]) => set.size > 1);
  if (mixed.length) {
    findings.push({
      category: 'inconsistent_status_values', severity: 'low', rows: [],
      facts: { groups: mixed.map(([canon, set]) => ({ meaning: canon, spellings: [...set] })) },
    });
  }

  return findings;
}
const dateFmtLabel = (f) => ({ us: 'MM/DD/YYYY', iso: 'YYYY-MM-DD', text: 'Mon D YYYY' }[f] || f);
const amtFmtLabel = (f) => ({ symbol: '$1,200.00', decimal: '1200.00', integer: '1200' }[f] || f);

// ---------------------------------------------------------------------------
// NARRATIVE, DEMO. Prepared plain-English wording for each detected finding.
// (The counts and rows come from the real detection above, so this is not faked.)
// ---------------------------------------------------------------------------
const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;
const DEMO_NARRATIVE = {
  missing_required_field: (f) => ({
    title: `${plural(f.rows.length, 'row')} missing a required field`,
    detail: `These rows are missing a value the books cannot do without: ${f.facts.details.map((d) => `row ${d.line} (${d.invoiceNo}) has no ${d.missing.join(' or ')}`).join('; ')}.`,
    recommendation: 'Fill in the missing values at the source before these rows are used for any total.',
  }),
  duplicate_invoice_number: (f) => ({
    title: `${plural(f.facts.groups.length, 'invoice number')} used more than once`,
    detail: f.facts.groups.map((g) => `Invoice ${g.invoiceNo} appears on rows ${g.lines.join(' and ')}${g.amountsDiffer ? ', and the two rows even show different amounts' : ''}.`).join(' '),
    recommendation: 'Confirm which entry is correct, delete the duplicate, and check whether it was also paid twice.',
  }),
  possible_double_billing: (f) => ({
    title: `${plural(f.facts.groups.length, 'possible double charge')}`,
    detail: f.facts.groups.map((g) => `${g.client} has two invoices (${g.invoices.join(', ')}) for the same amount on the same day (${g.issueDate}).`).join(' '),
    recommendation: 'Check with the client. Same amount, same day, different invoice number is often the same job billed twice.',
  }),
  amount_outlier: (f) => ({
    title: `${plural(f.rows.length, 'amount looks', 'amounts look')} far out of range`,
    detail: `The typical invoice here is about $${f.facts.median.toLocaleString('en-US')}. ${f.facts.items.map((i) => `${i.invoiceNo} is $${i.amount.toLocaleString('en-US')}, roughly ${i.timesMedian} times that`).join('; ')}.`,
    recommendation: 'A value this far off is usually a typo (an extra zero or a misplaced decimal). Verify the real amount.',
  }),
  unknown_client_reference: (f) => ({
    title: `${plural(f.rows.length, 'invoice')} pointing to an unknown client`,
    detail: f.facts.items.map((i) => `${i.invoiceNo} is billed to "${i.client}", which is not in your client list.`).join(' '),
    recommendation: 'Either add the client to your records or fix the name. Unknown payers make revenue-by-client wrong.',
  }),
  date_logic_error: (f) => ({
    title: `${plural(f.rows.length, 'row')} with dates that cannot be right`,
    detail: f.facts.items.map((i) => `${i.invoiceNo}: ${i.problems.join(' and ')}.`).join(' '),
    recommendation: 'Correct the dates. Impossible orderings usually mean a field was typed into the wrong column.',
  }),
  future_date: (f) => ({
    title: `${plural(f.rows.length, 'invoice')} dated in the future`,
    detail: f.facts.items.map((i) => `${i.invoiceNo} has a ${i.fields.join(' and ')}, which is after today.`).join(' '),
    recommendation: 'Check the year. A future issue or paid date is almost always a mistyped date.',
  }),
  status_contradiction: (f) => ({
    title: `${plural(f.rows.length, 'status')} that contradicts the dates`,
    detail: f.facts.items.map((i) => `${i.invoiceNo} is ${i.problems.join(' and ')}.`).join(' '),
    recommendation: 'Bring the status and the dates into agreement so aging and paid totals can be trusted.',
  }),
  unrecognized_status: (f) => ({
    title: `${plural(f.rows.length, 'row')} with an unrecognized status`,
    detail: `The value ${f.facts.values.map((v) => `"${v}"`).join(', ')} does not map to paid, unpaid, or overdue (${f.facts.items.map((i) => i.invoiceNo).join(', ')}).`,
    recommendation: 'Decide what this status means and convert it to one of your standard values.',
  }),
  inconsistent_date_format: (f) => ({
    title: 'Dates are written in more than one format',
    detail: `This file mixes ${f.facts.formats.join(', ')}. Mixed formats are the most common cause of dates being read wrong.`,
    recommendation: 'Standardize on one date format (YYYY-MM-DD is safest) across the whole export.',
  }),
  inconsistent_amount_format: (f) => ({
    title: 'Amounts are written in more than one format',
    detail: `This file mixes ${f.facts.formats.join(', ')}. Inconsistent number formatting causes totals to silently drop rows.`,
    recommendation: 'Store amounts as plain numbers with two decimals and no currency symbols.',
  }),
  inconsistent_status_values: (f) => ({
    title: 'The same status is spelled several ways',
    detail: f.facts.groups.map((g) => `"${g.meaning}" appears as ${g.spellings.map((s) => `"${s}"`).join(', ')}`).join('; ') + '.',
    recommendation: 'Pick one spelling per status. Reports that group by status miss rows spelled differently.',
  }),
};
function demoNarrative(finding) {
  const fn = DEMO_NARRATIVE[finding.category];
  return fn ? fn(finding) : { title: finding.category, detail: '', recommendation: '' };
}

// ---------------------------------------------------------------------------
// NARRATIVE, LIVE. Ask Claude to write the wording and weigh in on severity.
// ---------------------------------------------------------------------------
async function liveNarrate(findings) {
  const compact = findings.map((f) => ({ category: f.category, severity: f.severity, facts: f.facts, sampleRows: f.rows.slice(0, 6) }));
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': getApiKey(),
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      system:
        'You are a bookkeeping data-quality reviewer. You are given issues ALREADY DETECTED in an ' +
        'invoice export (the detection is done; do not invent new issues or change the facts). For each ' +
        'issue, write a short plain-English title, a one or two sentence explanation a small-business owner ' +
        'would understand, and a concrete recommendation. Keep the given severity unless it is clearly wrong. ' +
        'Do not use em-dashes.',
      messages: [{ role: 'user', content: `Detected issues (JSON):\n${JSON.stringify(compact, null, 0)}` }],
      output_config: {
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              findings: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    category: { type: 'string' },
                    severity: { type: 'string', enum: ['high', 'medium', 'low'] },
                    title: { type: 'string' },
                    detail: { type: 'string' },
                    recommendation: { type: 'string' },
                  },
                  required: ['category', 'severity', 'title', 'detail', 'recommendation'],
                  additionalProperties: false,
                },
              },
            },
            required: ['findings'],
            additionalProperties: false,
          },
        },
      },
    }),
  });

  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.error?.message || ''; } catch { /* ignore */ }
    if (res.status === 401) throw new Error('Anthropic rejected the API key (401). Check the key and try again.');
    throw new Error(`Anthropic API error ${res.status}${detail ? ': ' + detail : ''}`);
  }
  const data = await res.json();
  const textBlock = (data.content || []).find((b) => b.type === 'text');
  if (!textBlock) throw new Error('No audit narrative returned by the model.');
  const parsed = JSON.parse(textBlock.text);
  const byCat = new Map((parsed.findings || []).map((x) => [x.category, x]));
  return byCat;
}

// ---------------------------------------------------------------------------
// Assemble the ranked report. This is the function the UI calls.
// ---------------------------------------------------------------------------
function rank(findings) {
  return [...findings].sort((a, b) =>
    (SEV[b.severity] - SEV[a.severity]) || (b.rows.length - a.rows.length) || a.category.localeCompare(b.category)
  );
}
const PENALTY = { high: 6, medium: 3, low: 2 };

export async function auditRows(rows, cols, clients) {
  const records = normalizeRows(rows, cols);
  const detected = detectIssues(records, clients);

  const live = hasApiKey();
  let narrated = null;
  if (live) {
    try { narrated = await liveNarrate(detected); }
    catch (e) { throw e; } // surfaced by the UI; detection already succeeded
  }

  const findings = rank(detected).map((f, i) => {
    const ai = narrated && narrated.get(f.category);
    const base = demoNarrative(f);
    const severity = (ai && ai.severity) || f.severity;
    const affected = new Set(f.rows.map((r) => r.line));
    return {
      id: i + 1,
      category: f.category,
      severity,
      title: (ai && ai.title) || base.title,
      detail: (ai && ai.detail) || base.detail,
      recommendation: (ai && ai.recommendation) || base.recommendation,
      rows: f.rows,
      rowCount: affected.size,
    };
  });

  const bySeverity = { high: 0, medium: 0, low: 0 };
  const affectedRows = new Set();
  let penalty = 0;
  for (const f of findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
    penalty += PENALTY[f.severity] || 0;
    f.rows.forEach((r) => affectedRows.add(r.line));
  }
  const trustScore = Math.max(0, Math.min(100, 100 - penalty));

  return {
    source: live ? 'live' : 'demo',
    summary: {
      rowsChecked: records.length,
      issuesFound: findings.length,
      rowsAffected: affectedRows.size,
      trustScore,
      bySeverity,
    },
    findings,
  };
}
