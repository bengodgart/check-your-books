---
type: Playbook
title: Run Check Your Books locally
description: 'How to serve Check Your Books and run its tests on a dev machine.'
generated:
  by: claude-opus-5
  at: '2026-07-29T04:31:42+00:00'
status: stable
---

# Steps

1. Clone the repo: `git clone https://github.com/bengodgart/check-your-books.git`
2. `cd check-your-books`
3. `python -m http.server 8000`, then open `http://localhost:8000`.
4. Click **Load the sample messy export**, then **Audit**. The full report appears with no
   key needed.

## Optional live mode

Open **Settings and API key**, paste an Anthropic API key, and click **Save key**. The badge
flips to LIVE and the next audit calls Claude directly from the browser to write each
finding. A single audit costs a few cents at most, billed to that account.

## Available scripts

* `node test-node.mjs` runs the kernel test. It parses the dirty sample, runs the auditor in
  demo mode, confirms every planted defect is caught with the right rows and severity, and
  prints `ALL PASS`.

## Common failures

* **Opening `index.html` directly from disk does not work.** The JavaScript loads as ES
  modules, which browsers only allow over `http://`. Serve the folder as in step 3.
* Today is fixed at 2026-07-15 in the sample data on purpose, so the overdue and future-date
  maths stays stable across loads.
