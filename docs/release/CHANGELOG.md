
## M1 — 2026-07-22

- Added a minimal, resumable two-year price foundation queue.
- Added automatic rate limiting, retries, stale-task recovery, and progress API.
- Added Supabase migration `20260722_m1_price_foundation.sql`.
- Added three-symbol validation mode for 1101, 2330, and 6182.
- Removed the broken legacy `/api/sync/check` route and unfinished generic sync-job files.
- Preserved existing pages, analysis, watchlist, price repository, and FinMind provider.
