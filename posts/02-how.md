<!-- DRAFT for Ben to review. Preview, edit, and post yourself. Never auto-posted. -->

# Post 2: how I built it

Check Your Books is two layers on purpose, and keeping them apart is the whole design.

Layer one is detection, and it is boring deterministic code. Given the invoice rows, it normalizes the messy stuff first: three date formats parsed to one, amounts stripped of dollar signs and commas, status words like "settled" and "past due" mapped to a canonical set. Then it runs the rules. Duplicate invoice numbers. Same client, same amount, same day, different invoice number, which is often one job billed twice. Amounts that are a wild multiple of the median, the classic extra-zero typo. Clients not on the roster. Paid dates before issue dates. Future dates. Statuses that contradict the dates. It ranks the findings by severity and computes a trust score. No AI touches any of this, which is why the demo is honest: the issues it reports are really in the data.

Layer two is narration, and that is where the AI earns its place. The rules produce machine facts. Turning "duplicate_invoice_number, rows 9 and 41, amounts differ" into a sentence a small-business owner can act on is a language job. In demo mode that wording ships prepared. In live mode the browser calls Claude with your own key to write each finding's title, explanation, and fix. Same detection either way; the model only writes.

There is no backend. It is static files. Your export is parsed in the browser and never uploaded, because there is nowhere to upload it. Your API key lives only in your browser's localStorage and goes only to Anthropic.

The lesson I keep coming back to: let deterministic code decide what is true, and let the model decide how to say it. Do not mix those two jobs.

Link in the comments. Last post is where this goes next.
