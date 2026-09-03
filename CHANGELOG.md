## M8.11.9 — 15:00 Daily Dataset Lock & Training Export
- Fixed weekday 15:00 Asia/Taipei close schedule using one approved Vercel cron.
- Added compact daily training records and 1/3/5/10-day mature labels.
- Added persistent JSON/TXT downloaded status.
- Rejects zero-price / impossible international quote moves from training eligibility.
- Enlarged stock/list data typography to body-text size.

## M8.11.7 — Portfolio Dashboard Alignment

- Replaced the outdated live Top20 Cohort dashboard card with Swing10 test performance.
- Added management actions for real holdings, Swing10 tests, and unified watchlist.
- Excluded legacy `stealth-radar-top20` lots from the live Portfolio table/summary without deleting history.
- Added compact realized performance for real and Swing10 closed trades.
- Added Early Watch EW-A/EW-B counts and average watch return.
- Removed the extra legacy Cohort fetch from Portfolio page load.
- No Turso schema migration.

## M8.11.6 — Unified Watchlist Source of Truth

- Unified Portfolio watch rows from `watchlist` + legacy `hot_stock_candidates`.
- Deduplicates by symbol with canonical watchlist priority.
- Shows watch source such as `Early Watch EW-A`.
- Cancelling a watch clears both legacy sources.
- Derives observation baseline price from existing daily prices; no schema migration.

## M8.11.5 — Early Watch Calibration & Low-Base Guard

- Recalibrated Early Watch to prevent 30/30 EW-A saturation.
- Added low-base risk downgrade for extreme monthly revenue YoY.
- Added revenue continuity and multi-evidence EW-A confirmation.
- Rebalanced Fundamental / Price Not Priced / Institutional / Technical / Catalyst scoring.
- Capped the revenue prefilter so extreme low-base values do not crowd the candidate universe.
- No new Turso migration or external API source.


## M8.11.4 — Early Watch / Catalyst Selection
- Adds Early Watch observation-only Top30 before Swing10.
- Adds official monthly revenue bulk ingestion for listed/OTC companies (best-effort, max 2 requests/day).
- Adds Fundamental Acceleration, Catalyst, Price-Not-Yet-Priced, Institutional Accumulation and Technical Setup sub-scores.
- Adds lightweight manual catalyst annotations for buyback/contracts/earnings/conferences/expansion/customer events.
- Adds Migration 36 with new tables only; no ALTER of stable Swing10/Queue schemas.
- Keeps M8.11.3 multi-confirm Exit Alerts and legacy Stealth Radar cleanup unchanged.

# M8.11.3

- Swing10 Exit Alert 改為多條件確認制，避免單一 Decision 下滑直接紅燈。
- 移除潛伏雷達主頁與 legacy API；舊網址轉到 Swing10。
- 底層法人潛伏服務改名 `lib/institutional-stealth`，仍供 Swing10 / Daily Pipeline 使用。
- 決策首頁改讀 Swing10，降低無效 Turso 讀取。

# M8.11.2

- Swing10 Position Continuity TypeScript build hotfix; no strategy/schema changes.

# M8.11.1

- Swing10 Opportunity Grade v2: A1/A0 and separate market posture.
- Removed duplicate market-risk veto from A-grade gating.
- Added relative Top5 opportunity panel.
- Added held-position scoring continuity outside Top20.
- Daily postprocess now keeps active Swing10 holdings in local Stealth/Risk scoring.
- No database migration.

# M8.10.29

- Swing10 A級候選新增測試部位防呆：已存在開啟中的測試部位時，「加入測試」改為「✅ 已加入測試」並停用。
- 「實際買入」仍保留，支援先紙上測試、之後再小額實戰。
- 後端原有 same-type `alreadyExists` 保護維持不變，UI 與資料層形成雙重防重複。
- 不變更 Swing10 選股、Exit Alert、Queue、Bulk、Turso schema 或 Migration 35。

# M8.10.28

- 修正 `app/swing10/page.tsx` PositionTable style object 的 TypeScript TS1312：`color=` 改為 `color:`。
- 不變更 Swing10 選股、交易、Exit Alert、Turso schema 或 Migration 35。
- 新增 release guard，避免 JSX style object 再出現 assignment syntax。
# M8.10.27

- Swing10 A級候選直接支援「加入測試 / 實際買入」。
- 保存進場 Swing10 / Decision / Stealth / Risk Snapshot。
- 每日收盤產生續抱、注意、賣出檢查；加入停利停損、Time Stop、獲利保護與訊號轉弱。
- Swing10 測試 / 實際交易分開統計勝率、平均報酬、平均持有日與已實現損益。
- Migration 35 僅新增小型交易連結與 Exit Alert 表，不增加全市場 Rows Read。

# M8.10.26

- Swing10 5–10日收盤觀察、A級候選、風險變化、站內/瀏覽器提醒。
- 每日只新增 Top20 Swing10 快照 + 1 筆 review，避免增加 Turso Rows Read。

# M8.10.24

- Add Market Risk, Margin Washout, Foreign Persistence and Day-trade Noise decision overlay.
- Official TWSE/TPEx Bulk public data, one snapshot per trading date; persist only Top40 microstructure rows.
- Keep Stealth/Winner25 base score unchanged and rank by bounded `decisionScore`.
- Close the HTTP 402/429 `attempts=4` non-terminal retry dead-zone.

# M8.10.22

- Durable Queue Recovery v2: successor consumption proof, generation fencing, orphan recovery.

# M8.10.17 — Unified Progress Source of Truth

- Unified Development Center, Global Progress, Queue and Pipeline identity on the persisted Active Job Pointer.
- Removed independent status lookup that could display 0/0 while Diagnostics had real progress.
- Joined pipeline state into the active pointer row and seeded pipeline identity at job start.
- Invalidated M8.10.15 browser status cache via a new cache namespace.
- Retains M8.10.15 effective-trading-date and empty-job recovery.

# M8.10.15 — Active Job Diagnostics & Source-of-Truth Repair

## M8.10.15

- Promoted the Job Source of Truth work to a clean new release.
- Fixed nullable `DatabaseStatement` typing in `lib/cloud/jobs.ts`.
- Retained Active Job diagnostics, pointer repair, count reconciliation, and Vercel Queue/pipeline cross-checks.
- Updated package/release identifiers to 8.10.15 / M8.10.15.


- 統一 Development Daily Update 的 Active Job Source of Truth。
- 新增 singleton pointer diagnostics，直接比對 Pointer / Queue / Pipeline / Active Job ID。
- 移除 cloud job fallback 以 `updated_at DESC LIMIT 1` 猜 Job 的邏輯。
- pointer 遺失或失效時，以唯一 `YYYY-MM-DD-development` job_date 自動修復。
- Queue publisher 記錄實際送出的 jobId / messageId。
- 診斷區確認 cloud_update_items 是否存在；僅在 job summary 不合理時才做 COUNT/SUM 修復，以保護 Turso Rows Read。
- Development Center 與 Daily Lab 新增可收合 Active Job Diagnostics。
- CI 規則與目前架構一致：GitHub Scheduler / Vercel Cron 維持停用，Vercel Queue 為續傳機制。

# M8.10.12

- Added automatic recovery for orphan `0/0` daily-update jobs.
- Added cheap `LIMIT 1` queue integrity probes instead of aggregate scans.
- Added pre-build and post-build validation so empty jobs cannot reach Vercel Queue.
- Rebuild clears stale postprocess state when reusing the same daily job id.
- Preserved all M8.10.9 Turso read-efficiency safeguards.

# M8.10.9 — Turso Efficiency Edition

- Replaced hot-path aggregate queue scans with incremental `cloud_update_jobs` counters.
- Added `stock_sync_checkpoint` and queue/status indexes in Turso Migration 27.
- Skips repeated price provider and 260-day technical reads when a symbol is already current.
- Removed full-market Winner25/Stealth live scoring from the 2,143-symbol market loop; Top40 only.
- Bounded foreign snapshot repair to 60/61 rows per symbol.
- Reduced Smart Selection ownership/institutional history reads to candidate snapshots.
- Added cross-tab single-leader status polling at 12 seconds plus warm Vercel response cache.
- Removed full `daily_prices` scans from sync monitor and per-table `COUNT(*)` scans from database health.
- Optimized portfolio / Cohort latest-price and observation reads.
- Added `npm run read-budget:check` to prevent known high-read regressions.
- Architecture target: 80–95% lower normal daily Turso Rows Read; actual percentage must be measured after account quota is restored.

## M8.10.9 — Automatic Continuation Hotfix

- 每日一鍵更新改為按一次後自動續傳。
- Vercel `/resume` 改為 Queue-aware，不再依賴 serverless in-memory Worker。
- Queue consumer 依 `nextRetryAt` 延遲接棒，避免額度冷卻期間空轉。
- 全站進度條加入 8 秒停滯 watchdog 與 12 秒 retry guard。
- Queue message 使用 idempotency key 降低多分頁／重複續傳。
- Queue retention 修正為 Vercel 支援的 24 小時上限。
- 不新增 Cron / GitHub Actions 排程。

## M8.10.6.3 — Taiwan Equity Universe Audit Fix

- 強化普通股 Universe：四碼、首碼 1–9、排除 91xx TDR。
- 名稱／產業／市場三層排除 ETF、ETN、權證、基金、債券與其他非普通股商品。
- `略過 = 0` 若來源主檔本來就只含普通股，視為可接受狀態，不再誤判為分類器一定失效。
- 合併 M8.10.6.2 production build TypeScript hotfix。

## M8.10.6.2 — Market Universe & Failure Classification Hotfix

- 每日市場更新新增普通股 Universe，ETF／ETN／權證／非普通股商品預先略過。
- 明確無資料與不適用商品改列 skipped，不再灌高真正失敗數。
- API 額度限制採 60 分鐘冷卻；網路／逾時採 5 分鐘冷卻。
- 額度限制出現後立即停止該批後續請求，避免快速四次重試。
- 診斷視窗新增「額度冷卻」狀態。
- Winner25、法人潛伏與 Top20 Cohort 演算法不變。

## M8.10.6.1 — Update Diagnostics Hotfix

- 修正全站進度條「查看詳情」無反應：改為固定最前層診斷視窗。
- 市場更新新增成功／略過／真正失敗／重試中／待處理分類。
- 新增最近失敗股票與錯誤類型統計。
- 新增只重新執行真正失敗項目。
- 無效／已失效證券改為 skipped，避免無效重試。
- 新增 Migration 25 保存 skipped_symbols，保持狀態輪詢輕量。

## M8.10.6 — Unified Daily Update & Stealth-Only Strategy

- 正式選股引擎收斂為「潛伏雷達」；主導覽移除 Bruce 精選。
- `/smart-selection` 保留相容導向至 `/stealth-scanner`，舊 composite 僅作內部診斷。
- 全站日常資料與分數更新統一由「每日一鍵更新」啟動。
- 全市場資料完成後，自動依序更新 Top40 法人籌碼、Winner25 即時爆發分與法人潛伏分。
- 新增 `daily_update_pipeline_state`（Turso migration 24）保存單一每日後處理進度與錯誤。
- Winner25 兩年歷史模型改為進階人工重訓，不混入每日操作。
- 潛伏雷達頁改為結果檢視頁；日常更新按鈕只導向每日一鍵更新中心。
- Top20 績效測試改為固定 Cohort：至少追蹤20交易日，每日只更新績效、不換股。
- 投資組合僅在沒有 Cohort 或上一期成熟後，才允許建立下一期 Top20。
- 舊版自動觀察池停用；實際持股、交易歷史與手動自選觀察保留。
- 正式潛力排序以法人潛伏為主，搭配通過 OOS Gate 的 Winner25；舊版綜合分不再主導排行。
- GitHub Actions / Vercel Cron 維持非自動排程，不新增背景排程費用。

## M8.10.5

- Winner25 與法人潛伏整併為單一「潛伏雷達」頁面與主導覽項目。
- 每日只需「一鍵更新潛伏雷達」，依序完成 40 檔 Winner25 即時分、法人潛伏分與排名同步。
- Winner25 兩年歷史掃描改為次要的「重新訓練 Winner25 模型」功能，不再與每日即時更新混在一起。
- 潛伏雷達同頁顯示歷史樣本、Winner 數、OOS Lift、模型狀態、今日候選與五構面分數。
- Winner25 歷史規則與強勢案例改為可折疊研究區塊。
- 主導覽移除獨立 Winner25 / 法人潛伏雙入口，統一為「潛伏雷達」。
- 舊 `/winner25` 路由保留相容導向，避免書籤失效。
- 不修改 M8.10.4.4 已驗證的計分權重；本版專注工作流整併。

## M8.10.4.4

- Live Result Synchronization Hotfix.
- 法人潛伏頁的讀取與更新統一使用同一組 40 檔候選 universe。
- 修正更新進度顯示 Winner25 40/40、法人潛伏 27/40，但摘要與表格仍讀到舊 5/40、4/40 的來源錯位。
- `/api/stealth-scanner` 強制 dynamic / no-store，並回傳 `candidateSymbols` 與 `readAt` 供驗證。
- 更新完成後前端會等待最終 Live Score reload，再顯示「完成並同步」。
- 不修改 Winner25 與法人潛伏演算法權重；本版只修資料寫入後的讀取一致性與 UI 同步。

## M8.10.4.3

- Winner25 Full-Coverage Pipeline Hotfix。
- 法人潛伏頁固定本次 40 檔候選，分批 4 檔依序完成 Winner25 即時評分與法人潛伏評分，避免排名更新後漏掃。
- Winner25 live scoring 改抓最近 180 個實際交易日，不再依賴日曆區間密度。
- 每批共用同一份 Winner25 歷史模型與規則，降低 Turso 重複查詢與中途 timeout 風險。
- 每檔失敗自動重試一次；整批 HTTP 失敗時前端退回逐檔重試。
- 法人潛伏頁新增全覆蓋進度、成功/失敗數、Winner25 有分數數量、法人潛伏有分數數量與失敗原因。
- Winner25 缺分不再影響原本可計算的法人潛伏分；live table 為即時評分來源，ai_analysis_latest 僅保留相容鏡像。

## M8.10.4.2

- Winner25 歷史規則正式套用今日候選股票，新增 live Breakout Score。
- 修正 Winner25 0/40：新增 winner25_live_scores，不再依賴 ai_analysis_latest 必須先存在。
- 最近價格改取最多 140 個實際交易日，修正部分股票被誤判價格特徵不足。
- 缺少可選法人/TDCC 特徵時按可用規則權重正規化，不補假資料。
- 法人潛伏頁新增具體 Winner25 缺口資訊。

## M8.10.4.1

- 修正法人潛伏頁 Winner25 已啟用卻顯示 0/40：更新潛伏分時同步持久化 Breakout Score 與模型狀態。
- 潛伏分改為核心資料必須、輔助資料動態加權，降低因 TDCC/投信部分缺失造成的整檔無分數。
- 新增資料完整度與缺失原因顯示。
- 不新增付費資料來源。

## M8.10.3.1
- Winner25 Turso batch stability hotfix.
- Small chunk writes + single-row fallback.
- Improved error diagnostics.


## M8.10.2 REV-C
- 修正全站殘留 M8.10.1 顯示字樣。
- 測試持股增加 #01～#20 顯示編號。
- 使用者介面的「觀察股」統一改稱「自選觀察」。
# M8.10.1 — Institutional Readability & Ownership Score 2.0

- 法人買賣 UI 統一以張顯示。
- 外資吸籌顯示為 0–100 分。
- 股權結構 20% 改由外資持股、大戶比例、散戶反向比例共同計算。
- 保留 M8.9.9 TDCC 免費 OpenAPI 與資料校驗。

# M8.9.9 — TDCC Free OpenAPI Distribution Sync

- Switched shareholder distribution primary provider to TDCC official free OpenAPI `/v1/opendata/1-5`.
- Removed the FinMind paid-tier shareholder-distribution fallback from runtime sync.
- Added JSON/CSV tolerant TDCC parser and field aliases.
- Fixed TDCC level 16/17 handling: adjustment and total rows are ignored.
- Kept large-holder definition at 400,001 shares and above; retail ratio is its complement.
- Distribution values are stored only after 0–100% and near-100% range validation.
- Retained M8.9.8 development stability recovery and API error handling.

## M8.10.2 Rev.B — Bruce 自動觀察池
- Bruce 精選每日更新完成後，自動把「推薦買進 / 分批布局」加入觀察池。
- 觀察池上限 20 檔；已在觀察池、實際持股、測試持股者不重複加入。
- 使用者主動取消觀察的股票不會被系統隔日自動加回。
- 自動保存加入當日收盤價與資料日期作為觀察基準。
- 投資組合顯示觀察編號、目前報酬、觀察交易日、10 日報酬與 20 日報酬。
- 觀察池摘要新增獲利檔數、未獲利檔數、滿 10 / 20 交易日檔數。

## M8.10.3
- 新增 Winner25 兩年歷史掃描器。
- Winner 定義：未來20交易日最高收盤價較訊號日收盤價上漲 >=25%。
- 新增價格/量能/外資/投信/外資持股/TDCC 歷史特徵分析。
- 使用 70/30 chronological split 做 out-of-sample 驗證，避免 look-ahead bias。
- 新增 Breakout Score；只有 OOS Gate 通過才影響 Bruce 精選正式排序。
- 新增 `/winner25` 分析頁及 `/api/winner25/run`, `/api/winner25/report`。

## M8.10.4
- Added Institutional Stealth Scanner.
- Added foreign accumulation normalization by ADV20.
- Added investment-trust relay / acceleration score.
- Added strong-pullback score derived from Winner25 features.
- Added ownership-concentration-change score.
- Added launch-confirmation score.
- Added `potentialScore` and stealth-stage ranking to Bruce Selection.
- Auto watch-pool recommendation now prioritizes stealth / launch stages.
- Added `/stealth-scanner` page and manual refresh API.
- Added Turso migration 21 for stealth analysis fields.

