# twstock-M8.10.2 — Institutional Readability & Ownership Score 2.0

M8.10.2 builds on M8.9.9 and keeps the existing free-data architecture (TDCC OpenAPI + existing FinMind/Turso/Vercel usage).

## Changes

- 投信 10 日與個股法人買賣數量，UI 統一由「股」換算成「張」；資料庫仍保存原始股數。
- 外資吸籌欄位改顯示為 `xx/100`，避免把分數誤認為張數或百分比。
- 股權結構分數 2.0：外資持股 40% + 大戶比例 40% + 散戶反向 20%。
- 外資持股子分數以 40% 持股比例作為 100 分上限正規化。
- 股權分散資料未通過 TDCC 校驗時，大戶/散戶子分數維持 0，不虛構資料。


## Install

```bash
cd ~/Projects/twstock-M8.10.2
node scripts/link-shared-env.mjs
npm install
npm run verify
npm run dev
```

Open: http://localhost:3000/smart-selection
