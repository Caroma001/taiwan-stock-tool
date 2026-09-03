# twstock M8.10.20 — High Efficiency Bulk Daily Snapshot Engine

## 核心目的

將每日更新從「2,000+ 檔股票逐檔向上游抓資料」改成「每個有效交易日一次抓全市場 Snapshot，再做本地分析」。

## 更新流程

1. 解析有效交易日。
2. 使用 `daily_bulk_snapshot_runs` 取得單日 lease，避免多個 Queue consumer 重複下載。
3. 預設使用 TWSE + TPEx 官方全市場資料：價格 + 三大法人。
4. 官方資料失敗時才嘗試 FinMind bulk fallback。
5. 一次寫入 `daily_prices`、`foreign_investor_daily`、`institutional_holding_daily`、`stock_sync_checkpoint`。
6. 外資吸籌以約 180 檔為一組做 chunked historical read，再一次批次寫入 `foreign_accumulation_latest`；不再每檔做 60 + 61 rows 兩次查詢。
7. 個股 MarketPipeline 在 Bulk Snapshot 完成後只做 Turso 本地指標/決策分析，禁止逐檔呼叫 FinMind。
8. 市場完成後，Top40 才進行 Winner25 / 法人潛伏及候選專用補充資料。
9. Development Center 每 15 秒只讀一次 Active Job Pointer JOIN 摘要，不掃描 queue 來顯示進度。

## 防止額度爆量

- 同一交易日 Snapshot 完成後直接重用。
- Snapshot 抓取有 lease，避免 Queue race 重複請求。
- 402 / 429 / quota：Bulk Snapshot 冷卻 60 分鐘。
- network / timeout：冷卻 5 分鐘。
- 診斷區顯示 official / FinMind / total external request counts。

## 部署前檢查

```bash
npm ci
npm run typecheck
npm run verify
```

部署：

```bash
npx vercel link
npx vercel --prod
```

## M8.10.20 驗收重點

Development Center / Active Job Diagnostics 應看到：

- Bulk Snapshot = `completed`
- Bulk Price Rows > 0
- Bulk Institutional Rows > 0
- Bulk Accumulation Scores > 0
- 外部資料請求應為少量 market-wide requests，而非隨 processed_symbols 線性增加
- `processed / total` 主畫面與 Diagnostics 相同
