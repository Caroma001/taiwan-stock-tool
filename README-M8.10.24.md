# twstock M8.10.24 — Risk & Margin Intelligence

## Scope

M8.10.24 keeps the proven M8.10.23 Daily Pipeline, Bulk Engine, Durable Queue and Stealth/Winner25 scores unchanged. It adds a bounded **decision overlay** for live trading conditions.

### 1. Market Risk Regime

- Reuses `market_regime_daily` (SOX / Taiwan futures proxy / USD-TWD / VIX).
- Adds official TWSE TAIEX daily context.
- Produces `market_risk_score`, risk level and a bounded modifier.
- Negative market risk is mildly amplified by the stock's 20-day volatility beta proxy.

### 2. Margin Washout

- Public TWSE / TPEx margin balance data.
- Calculates 1-day immediately from current/previous balance.
- 5/10-day changes build locally as the stock remains in Top40.
- Falling margin + resilient price + positive foreign flow is rewarded.
- Price collapse + falling margin is treated as forced-liquidation risk, not a bullish washout.

### 3. Foreign Persistence / Day-trade Noise

- Reuses existing local foreign 5/10/20-day accumulation and buy-day consistency.
- Penalizes a one-day foreign spike that dominates the 5-day total.
- Uses official TWSE / TPEx day-trading volume as a short-term noise penalty.

## Turso / API budget

- Public data is fetched in Bulk at most once per trading date through `public_risk_snapshot_runs`.
- No FinMind or paid per-symbol fallback in the risk layer.
- Although official endpoints return the whole market, only current Top40 microstructure rows are persisted.
- UI reads only `risk_intelligence_latest` for Top40; it does not recompute historical features per page load.
- Migration 33 uses only new tables (`CREATE TABLE IF NOT EXISTS`); no `ALTER TABLE`.

## Ranking contract

`potentialScore` remains the validated Stealth/Winner25 base.

`decisionScore = potentialScore + bounded risk modifier`

The total modifier is capped to **-15 / +8** so real-world risk context cannot silently replace the core model.

## M8.10.22 reliability carry-forward

The proven HTTP 402/429 retry dead-zone is closed: rate-limit cooldown no longer consumes the permanent `attempts < 4` retry budget.
