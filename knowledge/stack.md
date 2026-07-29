---
type: Tech Stack
title: Check Your Books stack
description: 'Frameworks, storage and services Check Your Books runs on.'
runtime: Browser
framework: 'None. Plain HTML, CSS and JavaScript modules.'
build: 'None. No dependencies to install and no build step.'
storage: 'localStorage, for the Anthropic API key only.'
external_apis: 'Anthropic API, called directly from the browser, optional.'
tests: 'node test-node.mjs'
generated:
  by: claude-opus-5
  at: '2026-07-29T06:00:00+00:00'
status: stable
---

# Stack

* **Runtime**: the browser. There is no backend and no account.
* **Framework**: none. Plain HTML, CSS and JavaScript, loaded as ES modules.
* **Build**: none.
* **Files that carry the logic**: `audit.js` is the auditor, normalising rows, running the
  deterministic rules, ranking findings and computing the trust score. `csv.js` reads a
  pasted or uploaded CSV, handling quotes, embedded commas and mixed line endings.
  `sample-data.js` builds the synthetic dirty export from a fixed seed. `app.js` is the DOM
  wiring. `index.html` and `styles.css` are the page.
* **Storage**: `localStorage`, holding only the user's Anthropic API key. The key is sent
  only to Anthropic; there is no server in the middle.
* **External API**: the Anthropic API, optional. Without a key the tool runs in demo mode
  with prepared finding wording; the detection is identical either way.
* **Tests**: `node test-node.mjs`, which prints `ALL PASS` on success.

## Notes

Detection is deterministic code, not a model. The AI only writes the wording that explains
each finding to a non-technical owner, which is why demo mode is genuinely usable rather
than a stub.
