# 台股外資吸籌 AI 分析軟體 V5 專案結構自檢表

## 一、軟體核心目標

本軟體不是一般股票查詢器。

核心目標是：

找出「外資默默吸籌，但股價尚未大幅上漲，甚至仍在整理或下跌」的台股股票。

---

## 二、八大開發原則

1. 程式必須輕巧，容易檢查、容易維護。
2. 固定資料不重複下載，例如台股股票代號、名稱、上市櫃、產業。
3. 使用者加入股票後，自動下載過去 2 年資料並保存於資料庫。
4. 超過 2.5 年的歷史資料，由系統提醒使用者確認後刪除。
5. 使用者可自行輸入有興趣股票，一鍵更新後下載該股票 2 年資料。
6. 每日打開後，AI 自動分析外資吸籌狀況。
7. 軟體重點是找出外資吸籌但股價尚未大漲的股票。
8. 開發過程必須維護本檔案，避免重複建立資料夾與檔案。

---

## 三、目前主要資料夾用途

### app/

Next.js 頁面與 API。

常見內容：
- dashboard
- watchlist
- api

### services/

商業邏輯與 AI 邏輯。

目前包含：
- AnalysisEngine.ts
- DashboardService.ts
- PriceService.ts
- StockService.ts
- WatchlistService.ts
- SyncLogService.ts
- SyncEngine/
- DecisionEngine/
- analyzers/

### repositories/

資料庫讀寫層，只負責 Supabase CRUD。

目前包含：
- PriceRepository.ts
- AnalysisRepository.ts
- WatchlistRepository.ts

### providers/

外部資料來源。

目前包含：
- ProviderManager.ts
- FinMindPriceProvider.ts
- MockPriceProvider.ts

### lib/

共用工具與 Supabase client。

目前包含：
- supabase.ts

---

## 四、禁止任意新增的項目

除非必要，不新增：

- 新的 Service 資料夾
- 新的 Repository 資料夾
- 新的 Provider 資料夾
- 新的 Dashboard 頁面
- 功能重複的 Engine

新增前必須先檢查是否可放入既有架構。

---

## 五、資料保留規則

### 固定資料

永久保存：
- 股票代號
- 股票名稱
- 上市 / 上櫃
- 產業
- 股本

### 歷史資料

預設保存：
- 近 2 年股價
- 近 2 年外資資料

### 清理規則

超過 2.5 年資料：

- 不自動刪除
- 系統提醒
- 使用者確認後才刪除

---

## 六、目前開發優先順序

1. 修正 PriceDownloader：恢復下載近 2 年資料
2. 修正 RetentionService：改為檢查超過 2.5 年資料
3. 建立外資資料同步
4. 建立 ForeignAnalyzer 外資吸籌分析器
5. 建立外資吸籌排行榜 Top 8
6. 再優化 Dashboard 呈現

---

## 七、開發自檢規則

每次新增功能前先確認：

- 是否符合八大原則？
- 是否有助於找出外資吸籌股？
- 是否能放入既有資料夾？
- 是否會讓架構變複雜？
- 是否需要更新本文件？

如果答案偏離核心目標，暫緩開發。