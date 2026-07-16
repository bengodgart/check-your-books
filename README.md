# Check Your Books

A free, single-page tool that audits a bookkeeping export for data-quality problems. You paste or upload an invoice CSV, deterministic rules find the things that make a book untrustworthy (duplicates, amount outliers, broken client references, contradictory statuses, impossible dates, inconsistent formats), and you get a ranked report with a trust score. There is no backend and no account. Bring your own Anthropic API key to have Claude write the plain-English findings, or use it with no key at all in demo mode.

> Which invoice number got used twice? Which amount is a typo? Which client is not on your list? Which dates cannot be right? Paste the export, get the ranked report.

## Why this exists

Real exported books are never clean. Before anyone trusts a total, someone has to catch the duplicate invoice, the extra zero, the client that does not exist, the invoice marked paid with no paid date. That check is tedious and easy to skip. This tool does it in the open: the detection is deterministic code that runs client-side, so the issues it reports are really there, and the AI writes the wording that explains each one to a non-technical owner.

The sample export is made up. It is generated deterministically in your browser from a fixed seed, so every visitor sees the same messy data and the same findings.

## Use it

Serve the folder over a local web server and open it in your browser. There is no install and no build step, but the JavaScript modules only load over `http://`, not from a double-clicked file. From inside the project folder:

```
python -m http.server 8000
```

Then open `http://localhost:8000`. Any static server works, and deploying to a free host (GitHub Pages, Netlify drop) serves it the same way.

1. Click **Load the sample messy export**, then click **Audit**. The full report appears with no key needed.
2. See the trust score, the count of high, medium, and low issues, the rows affected, and the ranked findings, each with a plain-English explanation, a fix, and the offending invoice numbers.
3. To have Claude write the findings, open **Settings and API key**, paste your Anthropic API key, and click **Save key**. The badge flips to LIVE and the next audit calls Claude directly from your browser.

### Demo mode vs live mode

- **Demo mode** is the default and needs no key. Load the sample and click Audit and you get the complete report offline. The detection is real: the duplicates, outliers, broken references, contradictions, and bad dates are found by deterministic code, not guessed. What DEMO ships is prepared finding wording.
- **Live mode** turns on the moment you save an Anthropic API key. The detection is identical; the page then calls the Claude API directly from your browser to write each finding's title, explanation, and fix, and to weigh in on severity. Your key is stored only in this browser, in localStorage, and is sent only to Anthropic. There is no server of ours in the middle. A single audit costs a few cents at most, billed to your own account.

## How it works

- `audit.js` is the auditor. It normalizes the export rows, runs a set of deterministic rules (missing fields, duplicate invoice numbers, possible double billing, amount outliers, unknown clients, date logic errors, future dates, status contradictions, unrecognized statuses, inconsistent formats), ranks the findings by severity, and computes a trust score. With no key it uses prepared narrative; with a key it asks Claude to write the narrative.
- `csv.js` reads a pasted or uploaded CSV into headers and row objects, handling quotes, embedded commas, and mixed line endings.
- `sample-data.js` builds the synthetic dirty invoice export from a fixed seed, with a documented set of planted defects for the auditor to catch, plus the valid client roster.
- `app.js` is the DOM wiring: it loads the input, runs the parse to resolve-columns to audit flow, renders the report, and collects every error into one region.
- `index.html` and `styles.css` are the page.

## The data

One synthetic invoice export, about 48 rows across six months, with the messy headers `Invoice #`, `Client`, `Amount`, `Issue Date`, `Due Date`, `Status`, `Paid Date`. Roughly 36 rows are clean and internally consistent; the rest are planted defects, one per known data-quality problem. "Today" is fixed at 2026-07-15 so the overdue and future-date math stays stable across loads. None of it is real.

## Run the tests

```bash
node test-node.mjs
```

The kernel test parses the dirty sample, runs the auditor in demo mode, and confirms every planted defect is caught with the right rows and the right severity, that the narrative is present and copy-clean, and that the trust score is believable. It prints `ALL PASS` on success.

## Tech notes

No dependencies to install, no build step, static hosting. The whole thing is a handful of files. Your data never leaves the browser because there is no server to send it to, and your API key is stored only in your own browser.

## License

MIT, see [LICENSE](LICENSE).
