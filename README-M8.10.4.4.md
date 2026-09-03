# twstock M8.10.4.4 — Live Result Synchronization Hotfix

本版只修正法人潛伏掃描器的 Live Score 顯示一致性，不修改 Winner25 / Stealth 演算法。

## 修正重點

1. 更新與畫面讀取共用同一組 40 檔候選股票。
2. Winner25 / Stealth Live Score 以 `winner25_live_scores` 為即時來源。
3. `/api/stealth-scanner` 強制 `force-dynamic`、`revalidate=0` 與 HTTP `no-store`。
4. 每批更新後重新讀取；40/40 完成後再做一次最終同步讀取。
5. 頁面新增「候選池同步」指標，正常應為 40/40。

## 驗收

執行「更新 40 檔法人潛伏分」後，進度與摘要應一致，例如：

- Winner25 可評分：40/40
- 可用潛伏資料：約 27/40（依資料完整度而變動）
- 候選池同步：40/40

若法人資料不足，仍可低於 40；但不應再出現進度 Winner25 40/40、摘要卻只有 5/40 的矛盾。
