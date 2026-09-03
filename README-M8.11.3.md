# M8.11.3 — Swing10 Multi-Confirm Exit & Legacy Radar Cleanup

## Scope

M8.11.3 deliberately does **not** change Bulk, Durable Queue, Winner25, Risk Intelligence or Turso schema.

It closes two real-world usability issues found during the first Swing10 OOS position test:

1. Exit Alert was too sensitive: a single large Decision-score drop could create a red sell-check even when price damage was small and foreign persistence remained healthy.
2. The standalone Stealth Radar page had become redundant after Swing10 became the formal decision layer.

## Multi-confirm Exit Alert

Hard controls remain single-trigger red alerts:

- stop loss
- take profit
- max holding / Time Stop
- profit-protection giveback
- high market risk + very weak foreign persistence (<45)

Signal deterioration now requires **at least two independent confirmations** before a red sell-check:

- Decision score materially below entry
- foreign persistence weak
- grade deteriorated to C after at least 3 trading days
- price is already down at least 3%
- Top20 exit has persisted to the 7-day observation boundary
- no-momentum condition
- very high day-trade noise

A single bad market day, one Decision-score drop, or a fresh Top20 exit is WATCH first.

## Stealth Radar cleanup

- Removed the Stealth Radar UI from main navigation.
- `/stealth-scanner` remains only as a compatibility redirect to `/swing10`.
- Removed the four legacy `/api/stealth-scanner/*` UI endpoints.
- Moved the still-required institutional stealth calculation core from `lib/stealth-scanner/service.ts` to `lib/institutional-stealth/service.ts`.
- Decision Home now reads Swing10 directly instead of polling the old Stealth Radar API.
- Winner25 / Smart Selection legacy URLs redirect to Swing10.
- No database migration is required.

## Turso read impact

The cleanup reduces one recurring Decision Home read path because the home page no longer calls the Smart Selection-backed Stealth Radar API every refresh. Swing10 candidate rows are precomputed and bounded to 20 rows per trading date.
