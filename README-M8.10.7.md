# M8.10.7 — Automatic Continuation Hotfix

M8.10.7 將 M8.10.6.3 的「手動續傳」升級成混合式自動續傳。

## 核心變更

- 每日一鍵更新只需按一次。
- Vercel Queue consumer 每完成一批，自動發布下一個 continuation message。
- Queue 依 API `nextRetryAt` 使用延遲續傳；額度冷卻時不會每 2 秒空轉。
- 全站 `GlobalUpdateProgress` 變成 watchdog：若進度約 8 秒沒有前進，自動呼叫續傳 API。
- Vercel 上的續傳 API 不再嘗試使用短生命週期的 in-memory Worker，而是補送 Vercel Queue message。
- 多分頁同時開啟時，以 30 秒 idempotency window 避免重複補送。
- 本機開發仍使用既有 in-memory Worker，不改變 Mac 測試流程。
- 不新增 Vercel Cron 或 GitHub Actions 排程。
- 保留 M8.10.6.3 Taiwan Equity Universe、API cooldown、Winner25、法人潛伏與固定 Top20 Cohort。

## 日常操作

1. 開啟「每日一鍵更新」。
2. 按一次「每日一鍵更新全部」。
3. 之後可切換到潛伏雷達、投資組合或個股分析；全站 watchdog 仍會監看進度。
4. API 額度冷卻時系統等待至 `nextRetryAt`，不需要人工介入。

## 注意

Vercel Queue 是主要背景續傳路徑；瀏覽器 watchdog 是可靠性補強，不是 Cron。若所有瀏覽器關閉，Queue 仍應自行接棒；若 Queue 偶發停滯，重新打開任一頁面約數秒後 watchdog 會自動補送。
