# twstock M8.10.2 — Portfolio Simplification

本版移除自 M8.9.5 延續的 AI 虛擬基金功能。

- 投資組合頁只保留：全部、實際持股、測試與觀察。
- 移除 AI 虛擬基金 UI、API、service 與每日更新自動呼叫。
- 不主動 DROP Turso 既有 `ai_virtual_fund_records`，避免破壞歷史資料；程式已不再讀寫此表。
- 保留實際持股、測試持股、觀察股、交易紀錄、Bruce 精選、法人籌碼、TDCC 股權分散與每日更新。
