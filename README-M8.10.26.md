# twstock M8.10.26 — Swing10 Close Review

M8.10.26 adds a deliberately small observation layer for 5–10 trading-day swing decisions.
It does **not** retrain or replace Winner25, Stealth, Risk Intelligence, Bulk Snapshot or Durable Queue.

## Daily flow

1. Daily Update completes market / chip / Winner25 / Stealth / Risk Intelligence.
2. Swing10 stores only the current Top20 observation rows.
3. It compares the current candidates with the previous 1 and ~3 stored trading-day snapshots.
4. At most five names can receive grade A.
5. After 15:00 Asia/Taipei on a valid trading day, the site shows a global reminder until the daily review is marked complete.

## A-grade gate

A is intentionally strict and may be zero on many days. It requires:
- Decision score >= 50
- Stealth >= 60
- Trigger >= 55
- Market not High risk
- Foreign persistence >= 55
- Day-trade noise data present and penalty <= 6
- Risk-data confidence >= 40%
- 20-day price move not overly extended
- At least one prior trading-day Swing10 snapshot and no sharp decision-score deterioration

Margin washout is a positive/negative confirmation when available, but is not required until enough local history exists.

## Risk-change flags

The daily close review highlights:
- market risk worsening
- foreign persistence deterioration
- day-trade noise increase
- margin structure deterioration
- decision-score deterioration

## Turso budget

- `swing10_candidate_daily`: max 20 rows/trading day.
- `swing10_daily_review`: exactly 1 row/trading day.
- Reminder endpoint reads one daily-review row only.
- Browser notification preference is localStorage only.
- No Cron, no GitHub scheduler, no full-market duplicate history.

Browser notifications are best-effort and only fire while the web app/PWA is open. The in-app reminder is the canonical reminder.
