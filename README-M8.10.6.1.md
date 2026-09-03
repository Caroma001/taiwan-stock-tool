# twstock M8.10.6.1 — Update Diagnostics Hotfix

M8.10.6.1 專門修正 M8.10.6「查看詳情」按鈕無反應，以及市場更新成功／失敗資訊不足的問題。

## 主要修正

- 全站進度條的「查看詳情」改為真正的最前層診斷視窗，不再只是連回每日更新頁。
- 顯示目前股票、最後活動時間、Worker 狀態與整體任務狀態。
- 市場更新結果區分為：成功、略過／不適用、真正失敗、重試中、待處理。
- 顯示最近 30 筆錯誤：股票代號、分類、嘗試次數、狀態、時間與完整錯誤訊息。
- 錯誤自動分類：API 額度／限速、逾時、網路、FinMind、Turso／SQL、資料源無資料、無效證券、其他。
- 新增「只重新執行失敗項目」：只把真正的終止失敗重新排隊，不重跑已成功項目。
- 明確無效／已失效證券會標成 skipped，避免浪費 4 次 retry。
- 新增 `cloud_update_jobs.skipped_symbols`，讓日常狀態輪詢可低成本顯示略過數量。

## 日常操作

```bash
cd ~/Projects/twstock-M8.10.6.1
node scripts/link-shared-env.mjs
npm install
npm run verify
npm run dev
```

每日仍只使用「每日一鍵更新」。需要判斷更新為何變慢或失敗時，直接點全站進度條右側「查看詳情」。

## 費用與排程

本版沒有新增付費資料源，也沒有開啟 GitHub Actions / Vercel Cron 自動排程。
