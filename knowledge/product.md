---
type: Product
title: Check Your Books
description: A free single-page tool that audits a bookkeeping invoice export for data-quality problems and returns a ranked report with a trust score.
domain: Data & Analytics
users: Small business owners and bookkeepers checking an export before anyone trusts the totals; also hiring readers evaluating the portfolio.
lifecycle: shipped
pricing: Free. Optional live mode uses the reader's own Anthropic API key, billed to their account, a few cents per audit.
resource: https://github.com/bengodgart/check-your-books.git
generated:
  by: claude-opus-5
  at: '2026-07-29T00:45:00+00:00'
status: stable
---

# Check Your Books

Paste or upload an invoice CSV. Deterministic rules find the things that make a book
untrustworthy - duplicates, amount outliers, broken client references, contradictory
statuses, impossible dates, inconsistent formats - and the page returns a ranked report
with a trust score. No backend, no account.

## Who it is for

Anyone who has to trust a bookkeeping export before using its totals: the owner of a small
studio, the bookkeeper handing off the month, or a reader judging whether this developer
can tell deterministic checking from AI guessing.

## What problem it solves

Real exported books are never clean, and the check that catches the duplicate invoice or
the extra zero is tedious and easy to skip. This does it in the open: **detection is
deterministic code running client-side**, so every issue reported is really there. The
model's only job is wording the finding for a non-technical reader.

That split is the point of the project. Demo mode ships prepared narrative and needs no
key; live mode calls Claude from the browser to write each finding. The detection is
identical either way.

## Current state

Shipped and public. The sample export is synthetic - about 48 rows generated from a fixed
seed with one planted defect per known data-quality problem, and "today" pinned to
2026-07-15 so the overdue and future-date math stays stable across loads.
