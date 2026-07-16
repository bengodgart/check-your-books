<!-- DRAFT for Ben to review. Preview, edit, and post yourself. Never auto-posted. -->

# Post 1: why I built it

Every set of books I have ever been handed to work with was dirty. Not wrong on purpose, just human. The same invoice number entered twice. A $2,500 job typed as $250,000. A client name that is not on the client list. An invoice marked paid with no paid date. A due date that lands before the issue date.

None of that is exotic. It is what real exported books look like, and it is exactly the stuff that quietly makes a total wrong. Somebody has to catch it before anyone trusts the number, and that check is tedious, so it gets skipped.

So I built Check Your Books. You paste an invoice export, and it runs a stack of data-quality rules over it: duplicates, amount outliers, broken client references, contradictory statuses, impossible dates, inconsistent formats. It hands you back a ranked report with a trust score and, for each issue, the exact rows involved.

The part I care about: the detection is real code, not a model guessing. The duplicates it finds are duplicates. The outlier really is 100 times the typical invoice. It runs against a sample messy export I generated, not anyone's real data, so anyone can try it.

Link in the comments. Next post is how I built it, because a real QA engine plus an AI that explains its findings turned out to be a nice split.
