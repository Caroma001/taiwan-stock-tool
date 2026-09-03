# Turso Efficiency — M8.10.9

## Goal

Reduce normal daily Rows Read by 80–95% versus the pre-M8.10.9 architecture while preserving the same user-visible stock workflow. This is an engineering target until the blocked Turso account can be measured again.

## Removed high-read patterns

| Area | Before | M8.10.9 |
|---|---|---|
| Update status | Repeated queue `SUM/COUNT/MIN` scans | One `cloud_update_jobs` row |
| Browser polling | Multiple open tabs each polling | One elected leader, 12s cadence |
| Worker counters | Aggregate queue every batch | Increment counters transactionally |
| Price checkpoint | Historical `MAX(trade_date)` | `stock_sync_checkpoint` / `indicator_latest` |
| Repeated resume | Re-read 260 price rows even with no new price | Skip technical/AI work when no new price |
| Winner25 | Possible full-market live calculation | Top40 only |
| Foreign fallback | Unbounded historical IN query | 60/61-row bounded seeks |
| Smart selection | Whole ownership / long institutional history | Candidate-only latest snapshots |
| Sync monitor | Full `daily_prices` counts every poll | Compact run + indicator tables |
| DB health | `COUNT(*)` on every table | Schema metadata only |

## Data safety

- No historical `daily_prices`, institutional, TDCC, portfolio, or trade-history data is deleted by this release.
- Existing cloud job counters remain compatible.
- Queue claims are only recovered after 15 minutes of staleness to avoid two Vercel consumers duplicating the same work.
- `stock_sync_checkpoint` is additive and can be rebuilt from existing latest snapshots.

## Verification after Turso unblocks

1. Deploy M8.10.9 and run Migration 27 once.
2. Run one normal trading-day update without Winner25 retraining.
3. Record Rows Read before/after in Turso Usage.
4. Repeat for 3–5 trading days.
5. Use Turso query inspection to identify remaining top read consumers.
6. Target: <=20% of the previous daily read burn; stretch target <=5%.
