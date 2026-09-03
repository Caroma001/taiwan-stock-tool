# twstock M8.11.4 — Early Watch / Catalyst Selection

M8.11.4 extends M8.11.3 with an observation-only selection layer ahead of Swing10.
It is designed from the successful 7842 / 7792 cases: detect improving fundamentals and
institutional accumulation before price has fully repriced, then wait for Swing10 A0/A1
confirmation before test/real entry.

## New selection flow

```
Official monthly revenue + existing Turso price/foreign data
        ↓
Early Watch Top30
  EW-A / EW-B / WATCH
        ↓
Swing10 A0 / A1 confirmation
        ↓
Test / real entry
        ↓
M8.11.3 multi-confirm exit alerts
```

## Early Watch score (0-100)

- Fundamental acceleration: latest monthly revenue YoY / MoM / cumulative YoY and, once history exists, YoY acceleration.
- Catalyst: optional manually recorded public events such as buyback, large contract, earnings, investor conference, expansion or large customer.
- Price Not Yet Priced: 20-day price return, muted-price score and accumulation-vs-price divergence.
- Institutional accumulation: existing foreign accumulation score, acceleration and buy-day consistency.
- Technical setup: close vs MA20 / MA60. This is confirmation, not the main driver.

EW-A/EW-B are **observation grades only**. They do not expose a buy button and cannot
create a Swing10 position directly.

## Data / Turso budget

- Official monthly-revenue endpoints: at most 2 public requests per daily refresh (listed + OTC).
- Revenue history: about one row per company per month; unchanged month is not rewritten unless the stored snapshot is incomplete.
- Daily Early Watch persistence: max 30 rows/day.
- Candidate prefilter: top 160 revenue acceleration + top 160 foreign accumulation, unioned before scoring.
- No new 2,143-stock per-symbol API loop.

## Migration 36

Creates only new tables/indexes:

- `monthly_revenue_history`
- `early_watch_catalyst_events`
- `early_watch_daily`
- `early_watch_refresh_runs`

No ALTER TABLE is required.
