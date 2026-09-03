# twstock M8.10.4 — Institutional Stealth Scanner

M8.10.4 builds on the validated Winner25 historical model and adds a current-market Institutional Stealth Scanner.

## Core goals

- Find stocks where foreign investors are accumulating before a large price move.
- Detect investment-trust relay / acceleration rather than comparing raw share counts alone.
- Prefer strong intermediate trends with short-term pullbacks over already overheated names.
- Detect ownership concentration changes when TDCC history is available.
- Separate "stealth accumulation" from "launch confirmation".

## Institutional Stealth Score

- Foreign stealth: 30%
- Investment-trust relay: 20%
- Strong pullback: 20%
- Ownership concentration change: 15%
- Launch confirmation: 15%

The official ranking uses `potentialScore` only when stealth-data confidence is at least 50%.

`potentialScore = existing Bruce/Winner25 score × 55% + stealth score × 45%`

When stealth data is incomplete, the previous prediction score remains unchanged.

## Stages

- `法人潛伏`: foreign and trust activity is strengthening while price is still consolidating.
- `回檔布局`: medium trend is constructive and price is in a historically favorable pullback zone.
- `發動初期`: stealth score, trigger score, and Winner25 breakout score align.
- `資金觀察`: some constructive signals exist but the setup is not complete.
- `等待`: insufficient setup.

## New route

- `/stealth-scanner`
- `/api/stealth-scanner`
- `/api/stealth-scanner/refresh`

## Database migration

Migration 21 adds the stealth score and component fields to `ai_analysis_latest`.

No paid external data source is introduced by this version.
