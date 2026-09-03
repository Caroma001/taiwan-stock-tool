# twstock M8.10.27 — Swing10 Trade Execution & Exit Alerts

M8.10.27 closes the loop between Swing10 selection and portfolio management.
It does not add a new selection factor and does not rewrite the M8.10.25/26
market, Winner25, Stealth or Risk Intelligence pipeline.

## A-grade execution

Each current A-grade Swing10 candidate exposes two actions:

- **加入測試** — default 1 lot, zero simulated fees/tax, used for strategy win-rate validation.
- **實際買入** — user enters actual price and lots (0.1 lot = 100 shares is supported); existing portfolio fee calculation is reused.

The entry snapshot freezes Swing10/Decision/Stealth/Trigger/risk values in
`swing10_trade_positions` so later performance can be attributed to the entry
conditions that actually existed at the time.

## Exit alerts

Daily close processing evaluates only the small set of open Swing10 positions.
The system never submits an order automatically. It produces:

- 🟢 **續抱**
- 🟡 **注意**
- 🔴 **賣出檢查**

Initial transparent rules:

- +8% take-profit check
- -4.5% stop-loss check
- 10 trading-day Time Stop
- profit protection after +8% peak with >=4% giveback
- Decision score deterioration
- A/B/C/Top20 exit deterioration
- foreign-persistence deterioration
- high market risk + weak foreign persistence
- day-trade noise / no-momentum warnings

Rules are reminders, not automated trading instructions.

## Performance separation

Swing10 test and real trades are kept separate. Closed Swing10 trades reuse
`trade_history` and report win rate, average return, average holding days and
realized P/L independently for `test` and `real` positions.

## Turso budget

Migration 35 is additive only (`CREATE TABLE/INDEX`, no `ALTER TABLE`).
Daily exit evaluation reads only open Swing10 positions and at most their short
holding-window price rows. It does not rescan 2,143 stocks and does not call
external market APIs.
