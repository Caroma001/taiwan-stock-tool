# twstock-M8.8 — Foreign Smart Accumulation Engine

M8.8 將「外資默默投入、股價尚未明顯上漲」正式建立為獨立選股引擎。

## 核心功能

- 每檔股票同步 5／10／20／60 日外資買賣資料
- 已有 60 日資料後只回補最新 5 個日曆日，避免每日重抓整段歷史
- 依成交量比例評估外資投入強度，避免偏向大型股
- 計算買盤連續性、價格未反映、買盤加速與吸收效率
- 建立 0～100 分外資吸籌分數與 1～5 星訊號
- 新增 `/foreign-radar` 外資吸籌 Top 20 頁面
- 每日一鍵更新與個股重新分析會同步更新法人快照
- Top 30、熱門股與個股詳細頁共用同一套 Turso 快照
- 法人資料不足時明確顯示，不虛構分數

## 安裝

```bash
cd ~/Projects/twstock-M8.8
node scripts/link-shared-env.mjs
npm install
npm run verify
npm run dev
```

開啟：`http://localhost:3000/foreign-radar`

## 部署

```bash
npx vercel link
npm run deploy
```
