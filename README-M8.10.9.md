# M8.10.9 — Turso Efficiency Edition

M8.10.9 的唯一主軸是降低 Turso Rows Read。這一版保留 M8.10.8 的潛伏雷達、Winner25、Top20 Cohort、Universe 排除、Vercel Queue 自動續傳與無 Cron 原則，不新增選股功能。

## 主要省讀改造

- `cloud_update_jobs` 成為每日更新進度的單一摘要來源；Worker 在每個項目完成時增量更新成功／略過／失敗計數，不再每 12 檔重新 `SUM/COUNT` 全部 queue items。
- 新增 `stock_sync_checkpoint`，日常同步用一列 checkpoint 判斷價格／外資資料進度，避免重複 `MAX/COUNT` 歷史表。
- 若股票當天沒有新價格，不再重讀 260 日歷史並重寫技術面、AI 與決策快照。
- Winner25 / 法人潛伏不再對約 2,143 檔全市場逐檔計算；每日只在最終候選 Top40 做 live scoring。
- 外資快照修復改為每檔 `LIMIT 60/61` 的 index seek，不再把缺快照股票的完整歷史一次讀回再丟棄。
- Smart Selection 只讀候選股票的 ownership snapshot，並直接使用 latest trust snapshot，不再拉完整法人歷史後在 JavaScript 截前 20 日。
- 全站更新進度改為單一瀏覽器 leader，每 12 秒查一次；其他分頁透過 BroadcastChannel 共用結果。
- Vercel warm instance 7 秒內重複 status request 直接共用 cache。
- `/api/sync-status` 不再對 `daily_prices` 做 `COUNT(*)/COUNT(DISTINCT)/MAX`；只讀 compact latest/run tables。
- Turso 資料庫健康頁不再對每張 table 自動 `COUNT(*)`，避免一次開頁就掃描大量歷史資料。
- Portfolio / Top20 Cohort 的最新價改讀 `indicator_latest`；20 日成熟後觀察日數不再繼續掃完整持有期間。
- MigrationRunner 移除每次 service 建立時重複的 metadata/status round-trip。
- 新增 `npm run read-budget:check`，阻擋已知高耗讀 hot-path SQL 回歸。

## 80–95% 目標說明

M8.10.9 是以「日常操作總 Rows Read 降低 80–95%」為架構目標。原帳號目前已因 Turso quota 被封鎖，因此無法在開發環境對同一資料庫做 before/after 實際計量；本版先以移除高頻全表/歷史 aggregate scans、單列 checkpoint、候選池縮小與跨分頁共享 polling 來達成設計層級的大幅降讀。額度恢復或升級後，請以 Turso Usage / query inspection 實測 3–5 個交易日，再確認實際百分比。

## 部署後原則

- 不需要重建 Winner25 歷史模型。
- 不啟用 GitHub Actions / Vercel Cron。
- 若 Turso 帳號仍顯示 `BLOCKED`，程式無法繞過平台 quota；需等待額度重置或調整 Turso plan 後才可恢復讀取。
- Turso 恢復後第一次按「每日一鍵更新」會套用 Migration 27。
