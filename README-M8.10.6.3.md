# M8.10.6.3 — Taiwan Equity Universe Audit Fix

## 目的
M8.10.6.2 已解決大量假失敗與 API quota 快速重試問題；M8.10.6.3 進一步強化每日股票 Universe 的辨識與可解釋性。

## 主要修正
- 普通股 Universe 採四碼數字且首碼 1–9 的保守規則。
- 排除 0xxx、5/6 碼、英數混合商品代號。
- 排除 91xx TDR／存託憑證。
- 依名稱、產業、市場欄位排除 ETF、ETN、權證、基金、債券、期貨、選擇權、特別股與存託憑證。
- 新增 `summarizeDailyUniverse()` 供診斷與後續 UI 使用。
- 明確修正觀念：若 Turso 的 `stocks` 主檔本身已經只收普通股，`略過 = 0` 可以是正常結果，不應為了讓略過大於 0 而錯刪股票。
- 合併 M8.10.6.2 Vercel build 已驗證需要的 TypeScript hotfix：`lib/cloud/jobs.ts` 與 `lib/portfolio/stealth-test-pool.ts`。

## 不變項目
- Winner25 歷史模型不重訓。
- 法人潛伏演算法與權重不變。
- Top20 Cohort 不每天重建。
- GitHub Actions / Vercel Cron 維持停用。
