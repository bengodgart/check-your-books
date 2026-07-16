<!-- DRAFT for Ben to review. Preview, edit, and post yourself. Never auto-posted. -->

# Post 3: where it goes next

Check Your Books started as one idea: run a real data-quality engine over an invoice export in the browser, and let an AI explain what it found. It works. The interesting question is what it becomes when you point it at real books instead of my sample.

A few directions I am thinking about.

Point it at your own export. The same browser-only approach works on whatever CSV your accounting tool spits out. Your numbers still never leave your machine, which is the point for anyone nervous about handing their finances to a website.

More rules, and rules you can tune. Right now the thresholds are sensible defaults, an outlier is a big multiple of the median, and so on. The next step is letting an owner say "flag anything over this amount" or "these client names are aliases of one client, do not warn me," so the report fits how their books actually work.

A fix-it export. Today the tool reports issues; correcting them happens at the source. The obvious next step is a cleaned copy you can download, with a plain-English log of every change, so nothing is altered silently.

A trend, not a snapshot. Run it every month and the trust score becomes a line. Books that are getting cleaner or messier over time is a more useful signal than any single audit.

If you keep the books for a small business, I want to hear which data-quality mistake bites you most often. That is the rule worth adding next.

Link to try it in the comments. It is free, it runs in your browser, and the sample data is made up so you can poke at it with zero risk.
