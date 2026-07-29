---
type: Playbook
title: Run Check Your Books locally
description: Serve the folder over a local web server; there is no install and no build step.
generated:
  by: claude-opus-5
  at: '2026-07-29T00:45:00+00:00'
status: stable
---

# Steps

1. From inside the project folder, start any static server:

   ```
   python -m http.server 8000
   ```

2. Open `http://localhost:8000`.
3. Click **Load the sample messy export**, then **Audit**. The full report appears with
   no API key needed.
4. Optional live mode: open **Settings and API key**, paste an Anthropic API key, click
   **Save key**. The badge flips to LIVE and the next audit calls Claude from the browser
   to write the finding narrative. The key is stored in that browser's localStorage only.

# Common failures

* **Blank page from a double-clicked `index.html`.** The JavaScript modules only load over
  `http://`, not `file://`. Serve the folder.
* **Badge still says DEMO after saving a key.** The key is per-browser; a different browser
  or a cleared localStorage starts back in demo mode.
* **Findings look identical with and without a key.** That is correct. Detection is
  deterministic either way; the key only changes who writes the wording.

# Deploy

Any free static host serves it unchanged - GitHub Pages, a Netlify drop. There is no
backend to deploy.
