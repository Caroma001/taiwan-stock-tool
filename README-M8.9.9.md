# twstock-M8.9.9 — TDCC Free OpenAPI Distribution Sync

M8.9.9 focuses only on the missing large-holder / retail-holder data path.

## Changes

- Uses TDCC official free OpenAPI `/v1/opendata/1-5` as the primary shareholder-distribution source.
- Uses TDCC official legacy CSV only as a free fallback.
- Does **not** call FinMind `TaiwanStockHoldingSharesPer`, so this feature does not require a FinMind Backer/Sponsor plan.
- Downloads TDCC distribution data once and groups the requested symbols in memory instead of making one request per stock.
- Supports both JSON and CSV response formats, Chinese/English field names, `YYYYMMDD` dates, and security codes with trailing spaces.
- Explicitly ignores TDCC holding levels 16 (adjustment) and 17 (total). These rows must never be included in the 1–15 holding-range total.
- Large-holder ratio = TDCC levels 12–15 (400,001 shares and above).
- Retail ratio = 100% - large-holder ratio.
- Invalid distribution data is rejected instead of showing 0% or 199% values.

## First test

```bash
cd ~/Projects/twstock-M8.9.9
node scripts/link-shared-env.mjs
npm install
npm run verify
npm run dev
```

Open `http://localhost:3000/smart-selection` and run **補齊前20檔籌碼資料**.

Expected result: `股權分散資料` should move above `0/30` for ordinary stocks included in TDCC data. Securities not present in TDCC should remain `—` rather than be fabricated.
