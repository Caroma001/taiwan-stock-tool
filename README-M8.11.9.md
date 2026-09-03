# M8.11.9 — 15:00 Daily Dataset Lock & Training Export

## Purpose
M8.11.9 turns the daily integrated report into a reproducible training dataset workflow.

- Taiwan trading-day close lock: 15:00 Asia/Taipei.
- One approved Vercel cron at 07:00 UTC on weekdays starts the existing durable daily-update queue.
- Before 15:00 the UI only serves the latest completed trading day.
- Daily JSON contains Early Watch, Swing10, Fast5, market context and future-label placeholders.
- After 10 future trading sessions, 1/3/5/10-day returns, max gain/drawdown and quick-profit labels are hydrated on historical report reads.
- JSON/TXT download state is persisted in Turso so exported dates can be tracked across devices.
- Invalid international quotes (for example zero-price / impossible daily moves) are excluded from model-quality eligibility.
- Stock/data table text is aligned to normal body font size for readability.

## Migration 38
Adds only `daily_report_export_status`, one tiny row per exported trading day. No large table duplication.

## Training labels
- return1d / return3d / return5d / return10d
- maxGain5d / maxGain10d
- maxDrawdown5d / maxDrawdown10d
- hit5PctBy5d
- hit8PctBy10d
- hitStopLossBy10d (-4.5%)

The training export remains research data. It does not automatically change A0/A1 or execute trades.
