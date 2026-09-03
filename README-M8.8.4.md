# twstock-M8.8.4 — Watchlist & Portfolio Integration Hotfix

## 修正內容

- Bruce 精選加入熱門股後，立即成為「觀察股」。
- 觀察股由既有 `hot_stock_candidates` 與 `update_queue` 管理，不新增重複資料表。
- 投資組合預設顯示「全部」。
- 篩選保留：全部、實際持股、測試持股、觀察股。
- 全部模式同時顯示三種資料。
- 同一股票已有實際或測試持股時，不再重複顯示觀察股。
- 觀察股可直接開啟個股頁，或按「轉為持有」補填買進資料。
- 財務摘要只計算實際與測試持股，不把觀察股當成資產。

## 驗證

```bash
npm install
npm run verify
npm run dev
```

測試網址：

- `/smart-selection`
- `/portfolio-manager`
