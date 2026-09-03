# twstock M8.11.5 — Early Watch Calibration & Low-Base Guard

M8.11.5 recalibrates the M8.11.4 Early Watch layer without changing the validated Daily Pipeline, Swing10 Opportunity Grade, position continuity, or multi-confirm exit engine.

## Why this release

M8.11.4 successfully built the Early Watch pool but the first live run produced 30/30 EW-A candidates. The main causes were score saturation from extreme monthly-revenue YoY values, a price-not-priced component that was too easy to max, and an EW-A gate that did not require enough independent confirmation.

## Changes

- Caps hyper-growth revenue scoring; +500% and +1,000% YoY no longer receive more points than a strong but credible growth rate.
- Adds a low-base risk classifier (`none / medium / high`). Extreme YoY without a second independent confirmation is downgraded instead of promoted automatically.
- Adds revenue continuity confirmation using prior-month YoY when available, otherwise cumulative YoY + non-collapsing MoM.
- Rebalances component ceilings: fundamental, price-not-priced, institutional accumulation, technical setup, catalyst.
- EW-A now requires multiple independent evidence categories.
- No-catalyst EW-A remains possible, but only with sustained revenue improvement, strong institutional accumulation, early price positioning, and no low-base warning.
- Catalyst-backed EW-A uses a separate confirmation path.
- Candidate prefilter caps extreme raw YoY/cumulative values so low-base outliers do not crowd the whole candidate universe.
- Adds visible low-base / evidence calibration tags in the Early Watch table.
- No new external endpoint, no new migration, no schema ALTER.

## Intended result

EW-A should become a scarce high-conviction observation tier rather than a relative Top30 label. A day with zero EW-A is acceptable; a day with several genuine EW-A candidates is expected. EW-B/WATCH remain useful for early observation.
