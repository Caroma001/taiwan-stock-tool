# twstock M8.11.6 — Unified Watchlist Source of Truth

M8.11.6 fixes the split watchlist state exposed by Early Watch in M8.11.5.

## What changed

- Portfolio Manager now reads both `watchlist` and the legacy `hot_stock_candidates` watch pool in one query.
- Rows are deduplicated by `symbol`; canonical `watchlist` rows take priority.
- Early Watch rows are labeled in Portfolio (for example `Early Watch EW-A`).
- A watch entry baseline price is derived from the first available close on/after the watch date, so observation returns can be tracked without adding schema columns.
- Cancel Watch clears both `watchlist` and the legacy active hot-stock candidate state.
- No new migration, no new external API, no new full-market read loop.

The goal is one user-visible watchlist regardless of whether the symbol came from Early Watch, manual watchlist entry, or the legacy candidate pool.
