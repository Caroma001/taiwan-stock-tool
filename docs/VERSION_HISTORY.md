## M8.11.10 — Password-Free 15:00 Daily Close

- Removed `CRON_SECRET` authentication from `/api/scheduled/daily-close`.
- Removed `CRON_SECRET` from required runtime environment validation and CI placeholders.
- Retained weekday / market-closed / 15:00 Asia-Taipei safety gates.
- Retained non-resetting, idempotent daily-job reuse to prevent duplicate full-market updates.
- No database migration.

## M8.11.7 — Portfolio Dashboard Alignment

- Replaced the outdated live Top20 Cohort dashboard card with Swing10 test performance.
- Added management actions for real holdings, Swing10 tests, and unified watchlist.
- Excluded legacy `stealth-radar-top20` lots from the live Portfolio table/summary without deleting history.
- Added compact realized performance for real and Swing10 closed trades.
- Added Early Watch EW-A/EW-B counts and average watch return.
- Removed the extra legacy Cohort fetch from Portfolio page load.
- No Turso schema migration.

## M8.11.6 — Unified Watchlist Source of Truth

- Unified Portfolio watch rows from `watchlist` + legacy `hot_stock_candidates`.
- Deduplicates by symbol with canonical watchlist priority.
- Shows watch source such as `Early Watch EW-A`.
- Cancelling a watch clears both legacy sources.
- Derives observation baseline price from existing daily prices; no schema migration.

## M8.11.5

- Early Watch Calibration & Low-Base Guard.
- Hyper-growth revenue score cap and low-base risk downgrade.
- EW-A requires multi-source confirmation; no-catalyst EW-A requires sustained revenue + institutional + unpriced evidence.
- Preserves M8.11.4 low-read architecture and M8.11.3 Swing10/Exit behavior.

## M8.11.4
- Early Watch / Catalyst pre-Swing10 observation layer.
- Official monthly revenue + existing foreign/price signals; max 30 daily rows.

## M8.11.3 — Swing10 Multi-Confirm Exit & Legacy Radar Cleanup

- Exit alerts now require multi-factor confirmation for signal deterioration; stop-loss/take-profit/time rules remain hard controls.
- Removed standalone Stealth Radar UI/API layer; retained institutional stealth as an internal Swing10 feature engine.
- Decision Home now uses bounded Swing10 rows instead of the legacy Stealth Radar API.
- No Turso migration.

## M8.11.2 — Swing10 Position Continuity Type Safety
- Fixes 15 TypeScript build errors from M8.11.1 without changing strategy/schema.

## M8.10.12 — Orphan Job Recovery
- Auto-repairs quota-interrupted 0/0 daily jobs without reintroducing large Turso scans.

# Version History

| Version | Focus |
|---|---|
| **M8.10.9** | **Turso Efficiency Edition: incremental job counters, sync checkpoints, Top40-only live scoring, single-leader polling, read-budget guard** |
| **M8.8** | **Foreign Smart Accumulation Engine: incremental institutional sync, 5/10/20/60-day scoring and radar** |
| **M8.7.3** | **Display Manager: header settings, five font sizes, table density, accessibility** |
| **M8.7.2** | **Production Stability Hotfix: stable status schema, null-safe UI, Daily Lab recovery** |
| M8.4 | Development Mode and automation safety |
| M8.5 | Turso Data Center and update queue |
| M8.6 | Portfolio Manager foundation |
| M8.6.1 | AI Prediction Center and foreign accumulation |
| M8.6.2 | Stock Analysis Center and sector Top 3 |
| M8.6.3 | Vercel deployment preparation |
| M8.6.4 | Portfolio Manager, trades, cost, font and UI |
| M8.7 | AI Portfolio, capital efficiency and allocation |
| **M8.7.1** | **Release Framework: verify, deploy, smoke test, versioning and rollback** |


## M8.8.2 — UI Drawer & Lean Cleanup
- 顯示設定改為右側 Drawer，避開頂部進度條與導覽列。
- 首頁改為精簡決策首頁。
- 移除舊 AI 驗證、舊 Top30/M72、舊雲端控制台與重複頁面。
- 停止每日驗證快照與指標運算。
- 清除未使用套件與建置產物。
