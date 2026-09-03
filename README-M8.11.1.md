# twstock M8.11.1 — Swing10 Opportunity Grade v2 & Position Continuity

## What changed

1. **Opportunity grade and market risk are separated.** Market Risk is already included in Decision Score, so it no longer vetoes every A-grade candidate a second time.
2. **A1 / A0 grades.** A1 is a confirmed cross-day opportunity. A0 is a new/near-entry opportunity that is strong enough to test but not yet confirmed for real-money entry.
3. **Relative Top5 always visible.** Even when A1/A0 is empty, the page shows the strongest five relative opportunities and the remaining blockers.
4. **Position continuity.** Open Swing10 test/real positions are re-scored every trading day even if they leave the new-entry Top20. Decision, Stealth, foreign persistence, market risk and day-trade noise no longer disappear just because rank becomes OUT.
5. **Daily pipeline protects held positions.** Active Swing10 holdings are added to the local Winner25/Stealth/Risk scoring set. This adds only a handful of local rows/reads and does not rescan the full market.
6. **Top20 status is separate from opportunity grade.** A position can be B+ / B while OUT of today's Top20; OUT is no longer used as a substitute for missing analytics.

## Trading discipline

- A1: test or real buy may be created.
- A0: test is allowed; real buy is blocked until A1 confirmation.
- Market posture: Normal / Reduce Size / Avoid Chasing is shown separately.
- Existing exit rules remain: TP +8%, SL -4.5%, Time Stop 10 days, profit protection, decision deterioration and risk deterioration.

## Turso budget

No new migration. No new full-market table. Position continuity only scores the small set of currently open Swing10 positions using existing Turso history and the already-cached official risk snapshot.
