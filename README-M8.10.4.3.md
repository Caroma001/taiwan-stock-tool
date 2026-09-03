# twstock M8.10.4.3 — Winner25 Full-Coverage Pipeline Hotfix

本版專門修正 M8.10.4.2 法人潛伏頁只有少數股票完成 Winner25 即時評分的問題。

## 執行順序

1. 固定本次外資潛伏候選 40 檔，不因中途排名變化而改變。
2. 以 4 檔為一批呼叫 `/api/stealth-scanner/refresh`。
3. 每批只讀一次 Winner25 最新完成模型與規則。
4. 每檔讀取最近 180 個實際交易日，計算 Winner25 live features。
5. 套用已通過 OOS 驗證的 Winner25 規則，產生 Breakout Score。
6. 寫入 `winner25_live_scores`。
7. 使用同一份即時 features 計算法人潛伏五構面。
8. 寫入 live stealth score；`ai_analysis_latest` 僅作相容鏡像。
9. 失敗股票自動重試一次。若整批 HTTP 失敗，前端逐檔重試。

## 頁面

`/stealth-scanner` 的「更新 40 檔法人潛伏分」會顯示全覆蓋進度：

- 已完成 / 40
- 成功 / 失敗
- 本次 Winner25 有分數
- 本次法人潛伏有分數
- 最近失敗原因

## 驗收重點

完成後，「Winner25 可評分」應不再停留在少數幾檔。仍無法評分的股票會保留實際缺失原因，例如歷史價格交易日不足，而不是顯示尚未執行。
