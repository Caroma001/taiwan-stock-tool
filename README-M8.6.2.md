# twstock-M8.6.2

本版本針對資訊架構與使用體驗進行整理：

- 修正 AI 預測中心遇到 HTML 錯誤頁時的 JSON 解析異常。
- 補上 `/api/portfolio/ai-plan/history`，支援 14 日訊號追蹤。
- 個股分析與技術指標整合為 `/stock-analysis` 單一頁面。
- 原 `/ai-engine` 與 `/indicators` 會自動導向新的個股分析中心。
- 新增依領域顯示 AI 評分 Top 3：AI、PCB、散熱、記憶體、CPO、機器人、航太軍工、車用、ETF。
- 不再預設載入所有股票；需要其他股票時由使用者輸入代號查詢。
- 導覽列移除重複的「技術指標」入口，只保留「個股分析」。

## 啟動

```bash
cd ~/Projects/twstock-M8.6.2
node scripts/link-shared-env.mjs
npm install
npm run build
npm run dev
```

共用環境檔仍使用：

```text
~/Projects/GN.data/.env.local
```
