# twstock M8.10.3 — Winner25 Historical Breakout Study

## 目標

使用 Turso `daily_prices` 既有近兩年資料，找出「訊號日後 20 個交易日內，最高**收盤價**相對訊號日收盤價上漲 25% 以上」的歷史 Winner25 案例，分析發動前的共通特徵，建立 Breakout Score。

## 防止作弊 / Look-ahead bias

- 特徵只使用訊號日當天與之前資料。
- 未來 20 日價格只用來產生 `is_winner` 標籤。
- 同一波行情只保留第一個 Winner anchor，避免重複灌樣本。
- Control 每 10 個交易日抽一筆，降低高度相依樣本。
- 前 70% 時間資料學規則，後 30% 時間資料 out-of-sample 驗證。
- 只有 OOS Gate 通過時，Breakout Score 才影響 Bruce 精選正式排序。

## 分析特徵

價格/技術：5/10/20日漲跌、MA20/60位置、MA斜率、距20/60日高點、20日波動/回撤/區間振幅。

量能：5/20均量倍率、當日/20均量倍率、成交額倍率。

法人：外資/投信 5/10/20 日淨買超相對20日平均成交量（跨股票可比）。

持股：外資持股比例與20日變化（資料存在時）。

TDCC：大戶/散戶比例與4週變化（歷史資料存在時）。

## 執行

1. 啟動網站後進入 `/winner25`。
2. 按「開始兩年 Winner25 分析」。
3. 瀏覽器會以 20 檔一批呼叫後端，直到兩年資料完成。
4. 規則與樣本保存於 Turso，可重開頁面查看。
5. 完成後每日正常股票分析會計算 Breakout Score。

## 新資料表

- `winner25_runs`：每次研究版本與 OOS 結果。
- `winner25_samples`：Winner / control 樣本與當時特徵。
- `winner25_rules`：通過時間外樣本驗證的規則。

## 正式排序 Gate

模型至少 5 條規則，且至少 4 條規則在 OOS 有足夠支撐、Lift >= 1.10，整體加權 OOS Lift >= 1.15 才啟用。

未通過時仍顯示研究用 Breakout Score，但 Bruce 精選沿用 M8.10.2 原排序，不會因歷史過度擬合而改變正式推薦。

## 費用

Winner25 掃描只讀既有 Turso 歷史資料，不新增 FinMind/TDCC API 呼叫；不需要額外付費資料服務。
