# twstock M8.8.5 — Real Portfolio & Trade History Hotfix

- 實際資金、測試策略、觀察池摘要完全分開。
- 實際持股刪除時，可選擇加入交易歷史、僅刪除或取消。
- 賣出只輸入日期、價格、張數與備註。
- 系統自動估算買賣手續費及股票證交稅。
- 預設券商費率 0.1425%、最低 20 元、股票證交稅 0.3%，可由環境變數調整。
- 支援部分出售；剩餘張數繼續保留。

環境變數（選填）：
- TWSTOCK_BROKER_FEE_RATE
- TWSTOCK_BROKER_MIN_FEE
- TWSTOCK_STOCK_TRANSACTION_TAX_RATE
