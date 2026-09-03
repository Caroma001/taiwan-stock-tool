# twstock M8.11.7 — Portfolio Dashboard Alignment

M8.11.7 aligns the Portfolio dashboard with the live strategy stack.

## Live dashboard

1. Real investment performance
2. Swing10 test performance
3. Early Watch / unified watchlist performance

Legacy `stealth-radar-top20` Cohort lots remain in the database as historical benchmark data, but are excluded from the live Portfolio dashboard and Swing10 test summary.

Each live summary card now has a management action. Performance values remain system-calculated from lots, prices, and trade history; users edit the underlying positions/watchlist instead of editing computed returns directly.

No schema migration is required.
