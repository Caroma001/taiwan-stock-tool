# twstock M8.10.4.2 — Winner25 Live Scoring Hotfix

本版把已完成的 Winner25 歷史模型正式套用到「今日候選股票」：

- 直接讀取最新 completed Winner25 run 與 winner25_rules。
- 每檔取最近最多 140 個實際交易日；不足時不再依賴狹窄日曆區間。
- 只用當日及過去資料計算 Winner25 live features，避免 look-ahead bias。
- Live Breakout Score 依「目前可用規則權重」正規化；缺少法人/TDCC 輔助規則不會把股票直接打成 0 分。
- 需要至少 75% 核心價格特徵完整度才產生正式 Breakout Score。
- 新增 winner25_live_scores，避免 ai_analysis_latest 尚無該 symbol 時 UPDATE 0 rows 導致即時計分消失。
- 法人潛伏頁顯示 Winner25 即時缺口與特徵覆蓋率。
