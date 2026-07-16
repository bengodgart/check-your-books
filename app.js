// app.js, DOM wiring for Check Your Books. ES module. No backend, no build step.
// Takes a pasted or uploaded invoice export (or the built-in sample), runs the
// deterministic auditor, and renders a ranked data-quality report. The detection
// is real in both modes; DEMO ships prepared finding wording, LIVE has the browser
// call Claude with the visitor's own key to write it.

import { auditRows, resolveColumns, getApiKey, setApiKey, hasApiKey, MODEL } from './audit.js';
import { parseCsv } from './csv.js';
import { SAMPLE_CSV, CLIENTS } from './sample-data.js';

const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (ch) => (
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : '&quot;'
  ));
}

// ---- error alert region: collect all errors, never swallow ----
const errors = [];
function clearErrors() {
  errors.length = 0;
  renderErrors();
}
function addError(message) {
  errors.push(String(message));
  renderErrors();
}
function renderErrors() {
  const box = $('error-alert');
  if (errors.length === 0) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  box.classList.remove('hidden');
  const items = errors.map((e) => `<li>${escapeHtml(e)}</li>`).join('');
  const heading = errors.length === 1 ? 'Something went wrong' : 'Some things went wrong';
  box.innerHTML = `<b>${heading}</b><ul>${items}</ul>`;
}

// ---- mode + badges ----
function refreshMode() {
  const live = hasApiKey();
  const badge = $('mode-badge');
  badge.textContent = live ? 'LIVE mode' : 'DEMO mode';
  badge.className = 'mode-badge ' + (live ? 'live' : 'demo');
}

function setSourceBadge(source) {
  const badge = $('src-badge');
  const live = source === 'live';
  badge.textContent = live ? 'LIVE' : 'DEMO';
  badge.className = 'src-badge ' + (live ? 'live' : 'demo');
}

// ---- render the report ----
const SEV_LABEL = { high: 'High', medium: 'Medium', low: 'Low' };

function renderReport(report) {
  setSourceBadge(report.source);

  const s = report.summary;
  $('trust-score').textContent = String(s.trustScore);
  $('count-high').textContent = String(s.bySeverity.high || 0);
  $('count-medium').textContent = String(s.bySeverity.medium || 0);
  $('count-low').textContent = String(s.bySeverity.low || 0);
  $('count-rows').textContent = `${s.rowsAffected} of ${s.rowsChecked}`;

  const host = $('findings');
  host.innerHTML = '';

  if (report.findings.length === 0) {
    const p = document.createElement('p');
    p.className = 'all-clean';
    p.textContent = `No data-quality issues found across ${s.rowsChecked} rows. These books look clean.`;
    host.appendChild(p);
    return;
  }

  report.findings.forEach((f) => {
    const card = document.createElement('div');
    card.className = `finding sev-${f.severity}`;

    const chips = (f.rows || [])
      .map((r) => `<span class="row-chip">${escapeHtml(r.invoiceNo)}</span>`)
      .join('');

    card.innerHTML =
      `<div class="finding-head">` +
        `<span class="sev-badge sev-badge-${f.severity}">${escapeHtml(SEV_LABEL[f.severity] || f.severity)}</span>` +
        `<span class="finding-title">${escapeHtml(f.title)}</span>` +
      `</div>` +
      `<p class="finding-detail">${escapeHtml(f.detail)}</p>` +
      `<p class="finding-fix"><span class="fix-label">Fix:</span> ${escapeHtml(f.recommendation)}</p>` +
      (chips ? `<div class="row-chips">${chips}</div>` : '');

    host.appendChild(card);
  });
}

// ---- the audit pipeline ----
async function runAudit() {
  const text = $('csv-text').value;
  if (!text.trim()) {
    clearErrors();
    $('report-panel').classList.remove('hidden');
    addError('Paste some CSV text, upload a .csv file, or load the sample export first.');
    $('report-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  clearErrors();
  const btn = $('audit');
  btn.disabled = true;
  btn.textContent = hasApiKey() ? 'Auditing with Claude' : 'Auditing';

  // Wrapped so a throw can never strand the button on "Auditing": the finally
  // always restores it, and every error surfaces in the alert region.
  try {
    let parsed;
    try {
      parsed = parseCsv(text);
    } catch (e) {
      throw new Error('Could not read that as CSV: ' + (e && e.message ? e.message : e));
    }
    if (!parsed.headers.length || !parsed.rows.length) {
      throw new Error('That export has no data rows. It needs a header row and at least one row of values.');
    }

    const cols = resolveColumns(parsed.headers);
    const missing = ['invoiceNo', 'client', 'amount', 'issueDate'].filter((k) => !cols[k]);
    if (missing.length) {
      const names = { invoiceNo: 'invoice number', client: 'client', amount: 'amount', issueDate: 'issue date' };
      throw new Error(
        'Could not find the expected columns in this file. Missing: ' +
        missing.map((k) => names[k]).join(', ') +
        '. The export needs at least an invoice number, a client, an amount, and an issue date.'
      );
    }

    const report = await auditRows(parsed.rows, cols, CLIENTS);
    renderReport(report);
    $('report-panel').classList.remove('hidden');
    $('report-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    addError(e && e.message ? e.message : String(e));
    $('report-panel').classList.remove('hidden');
    $('report-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } finally {
    btn.disabled = false;
    btn.textContent = 'Audit';
  }
}

// ---- wire up settings ----
function flashKeyStatus(msg) {
  const s = $('key-status');
  s.textContent = msg;
  setTimeout(() => { s.textContent = ''; }, 2500);
}

function wireSettings() {
  $('model-id').textContent = MODEL;
  $('api-key').value = getApiKey();
  refreshMode();

  $('save-key').addEventListener('click', () => {
    const k = $('api-key').value.trim();
    setApiKey(k);
    refreshMode();
    flashKeyStatus(k ? 'Key saved. LIVE mode is on.' : 'Field was empty, key not saved.');
  });
  $('clear-key').addEventListener('click', () => {
    setApiKey('');
    $('api-key').value = '';
    refreshMode();
    flashKeyStatus('Key cleared. Back to DEMO mode.');
  });
}

// ---- wire up input ----
function wireInput() {
  $('load-sample').addEventListener('click', () => {
    $('csv-text').value = SAMPLE_CSV;
    $('file-name').textContent = '';
  });

  $('csv-file').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      $('csv-text').value = String(reader.result || '');
      $('file-name').textContent = `Loaded ${file.name}`;
    };
    reader.onerror = () => {
      $('file-name').textContent = '';
      clearErrors();
      $('report-panel').classList.remove('hidden');
      addError(`Could not read the file "${file.name}". Try pasting its contents instead.`);
    };
    reader.readAsText(file);
  });

  $('audit').addEventListener('click', runAudit);
}

wireSettings();
wireInput();
