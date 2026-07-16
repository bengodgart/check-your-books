# PRD, Check Your Books

**One-liner:** A free single-page tool where you paste or upload an invoice export, deterministic rules find the data-quality problems that make a book untrustworthy, and you get a ranked report with a trust score and a plain-English explanation of each issue, for anyone who wants their books checked before they trust a total, with no account and no backend.

**Usefulness:** Real exported books are never clean, and before anyone trusts a total someone has to catch the duplicate invoice, the mistyped amount, the client that does not exist, the invoice marked paid with no paid date. That check is tedious and easy to skip. This tool runs it in the open: the detection is deterministic code that runs client-side, so the issues it reports are really there, and the AI turns each machine finding into wording a non-technical owner can act on. It doubles as a portfolio piece proving a real data-quality engine plus a clean AI narration layer end to end.

## v1 scope (capped)
1. A settings panel: a password field for an Anthropic API key with Save and Clear, a DEMO or LIVE mode badge, plain copy that no key is needed to try it, that the detection is real either way, and the model id shown.
2. An input panel: a textarea to paste CSV, a file upload for a .csv, a button that loads the built-in messy sample, and an Audit button.
3. A report area, hidden until the first audit: a big trust-score tile with a DEMO or LIVE badge; a summary row of high, medium, and low issue counts plus rows affected; and the ranked findings, one card each with a colored severity badge, the title, the detail, a fix line, and the offending invoice numbers as chips.
4. Two modes wired through the existing kernel: DEMO returns prepared finding wording with no key; LIVE calls the Claude API directly from the browser using the visitor's own key, stored only in localStorage, to write the wording. The deterministic detection is identical in both.
5. One error region that collects every error from parsing, missing columns, and the live API call, and never swallows them, with the Audit button always restored even when a call throws.

## Non-goals (not v1)
- Any backend, hosted proxy, or account system. The page is static files only.
- Connecting to a real accounting system or writing back any fix. The tool reports issues; correcting them happens at the source.
- Editing the data in place or exporting a cleaned file. This audits; it does not clean.
- A charting library or build step. There is no npm and no framework.
- A model picker in the UI. The model is a one-line constant in the kernel.

## Demo path (stranger sees value in under 2 minutes)
Open the page, click Load the sample messy export, click Audit. See the trust score, the issue counts, and the ranked findings, each explaining a real problem in the sample data with the exact invoice numbers. Optionally paste an Anthropic key in settings, watch the badge flip to LIVE, and audit again to see Claude write the findings.

## Done when
- The page loads with no console errors, and loading the sample then clicking Audit produces the full report in demo mode with no key in under two minutes.
- DEMO mode works with no key; adding a key flips the badge to LIVE and clears cleanly.
- Errors from parsing, missing columns, and the API call surface in one error region and are never swallowed, and the Audit button is always restored after a throw.
- A file whose columns cannot be resolved shows a friendly message instead of crashing.
- The kernel test still passes (node test-node.mjs, exit 0).
- No em-dashes anywhere in the app or docs copy.
