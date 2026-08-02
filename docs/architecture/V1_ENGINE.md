# V1_ENGINE.md
# Taiwan Stock Database Engine (TSDE) V1.0

Version: 1.0
Status: Design Approved
Author: Bruce Project
Database: Supabase
Language: TypeScript
Framework: Next.js

---

# 1. Project Goal

TSDE (Taiwan Stock Database Engine) 的目標不是分析股票，而是建立一套可靠、安全、可長期維護的台股資料同步平台。

本系統必須做到：

- 建立完整兩年台股歷史資料
- 建立完整外資買賣超資料
- 自動同步
- 自動續傳
- 自動限速
- 自動重試
- 跨平台運作（Mac / Windows / Linux）
- 所有同步狀態儲存在 Supabase
- AI 分析完全獨立於同步系統

V1.0 不包含任何 AI 分析。

---

# 2. Design Principles

## Principle 1

所有資料必須永久保存於 Supabase。

任何電腦都不應保存同步狀態。

---

## Principle 2

所有同步工作皆可中斷。

重新啟動後必須可以自動接續。

---

## Principle 3

任何 Service 僅負責一項工作。

不得同時負責：

- 排程
- 下載
- AI
- Dashboard

---

## Principle 4

所有下載皆可重新執行。

不得因程式中斷導致資料遺失。

---

## Principle 5

任何同步皆不可影響 AI。

AI 永遠只讀資料。

---

# 3. System Architecture

                Dashboard
                    │
                    ▼
            ProgressService
                    │
                    ▼
             SyncJobService
                    │
            Job Queue (DB)
                    │
                    ▼
              WorkerService
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
     PriceDownloader     ForeignDownloader
          │                   │
          └─────────┬─────────┘
                    ▼
                RateLimiter
                    │
                    ▼
                RetryService
                    │
                    ▼
                 FinMind API
                    │
                    ▼
                 Supabase

---

# 4. Core Services

## SyncJobService

Responsibility

建立同步工作。

負責：

- createJob
- pauseJob
- resumeJob
- cancelJob
- completeJob

不得：

- 呼叫 FinMind
- 下載股票
- Sleep

---

## WorkerService

Responsibility

真正執行同步。

流程：

取得 waiting 工作

↓

更新 running

↓

下載資料

↓

寫入資料庫

↓

更新 completed

↓

取得下一份工作

不得：

- 建立 Job
- AI 分析

---

## PriceDownloader

Responsibility

下載單一股票歷史股價。

輸入：

股票代號

輸出：

股價資料

不得：

- 更新 Dashboard

---

## ForeignDownloader

Responsibility

下載外資買賣超。

不得：

- 更新同步進度

---

## RateLimiter

Responsibility

控制下載速度。

設定來源：

system_settings

例如：

download_delay_ms

batch_size

daily_limit

不得：

下載資料。

---

## RetryService

Responsibility

處理下載失敗。

策略：

1 minute

↓

5 minutes

↓

30 minutes

↓

6 hours

↓

Failed

不得：

重新建立 Job。

---

## ProgressService

Responsibility

統計：

completed

running

waiting

error

提供 Dashboard 顯示。

不得：

下載資料。

---

## Scheduler

Responsibility

建立每日同步工作。

不得：

直接下載股票。

---

# 5. Database Tables

stocks

股票基本資料

---

stock_prices

歷史股價

---

foreign_trading

外資買賣超

---

sync_jobs

同步任務

---

sync_job_items

同步項目

---

download_logs

下載紀錄

---

system_settings

系統設定

例如：

download_delay_ms

batch_size

retry_count

heartbeat_timeout

---

# 6. Worker Life Cycle

waiting

↓

running

↓

completed

↓

finished

若失敗：

waiting

↓

running

↓

retry

↓

running

↓

failed

---

# 7. Heartbeat

Worker 每完成一支股票：

更新

last_heartbeat_at

若超過 heartbeat_timeout

另一台 Worker 可以接手。

因此：

Mac

Windows

Linux

均可互相接續。

---

# 8. Rate Limiter

所有下載皆須經過：

RateLimiter

流程：

取得設定

↓

sleep(delay)

↓

下載

↓

sleep(delay)

不得直接呼叫 API。

---

# 9. Retry Strategy

第一次：

等待 1 分鐘

第二次：

等待 5 分鐘

第三次：

等待 30 分鐘

第四次：

等待 6 小時

第五次：

標示 Failed

等待人工處理。

---

# 10. Future Versions

V1.0

建立完整資料庫

V2.0

AI 分析

V3.0

選股引擎

V4.0

自動通知

V5.0

多資料來源

---

# 11. Development Rules

所有 Service：

只能有一個責任。

所有同步狀態：

必須儲存在 Supabase。

不得使用本地檔案紀錄同步。

所有下載：

皆須經過 Worker。

所有 Worker：

皆須遵守：

RateLimiter

RetryService

Heartbeat

任何 AI 模組不得修改同步資料。

---

End of Document
