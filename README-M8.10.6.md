# twstock M8.10.6 — Unified Daily Update & Stealth-Only Strategy

M8.10.6 把日常操作收斂成一條主流程：**每日一鍵更新 → 潛伏雷達 → 固定 Top20 Cohort 績效驗證**。

## 核心變更

- 「潛伏雷達」成為唯一正式選股引擎。
- `/smart-selection` 保留舊網址相容，但會直接導向 `/stealth-scanner`。
- 日常只從 `/development-center` 執行一次「每日一鍵更新」。
- 每日更新完成全市場資料後，自動依序處理：
  1. 潛伏雷達固定 Top40 候選
  2. 外資／投信／外資持股／TDCC 籌碼同步
  3. Winner25 今日即時爆發分
  4. 法人潛伏分
  5. 潛力分與排名更新
- Winner25 兩年歷史模型不會每天重訓；需要時才從潛伏雷達的「模型管理（進階）」人工重訓。
- 舊版自動觀察池停用，不再由舊排行自動加入股票。
- 潛伏雷達 Top20 改成固定 Cohort：每一期至少追蹤 20 個交易日，日常更新只更新績效，不每天換股。
- 實際持股、交易歷史與手動自選觀察獨立保留。

## 正式排行

正式潛力分的方向：

- 法人潛伏：65%
- 通過 OOS Gate 的 Winner25 爆發分：35%

舊版 composite 僅保留內部相容／診斷，不再直接決定正式推薦名單。

## 日常使用

1. 開啟 `/development-center`
2. 按「每日一鍵更新」
3. 完成後到 `/stealth-scanner` 查看 Top40
4. 到 `/portfolio-manager` 查看既有 Top20 Cohort 的 10／20 交易日績效
5. 只有目前沒有 Cohort，或上一期全部滿 20 交易日後，才建立下一期 Top20

## 安裝

```bash
cd ~/Projects/twstock-M8.10.6
node scripts/link-shared-env.mjs
npm install
npm run verify
npm run dev
```

## 自動化／費用原則

M8.10.6 不新增 GitHub Actions / Vercel Cron 自動排程；維持手動啟動每日一鍵更新。既有資料來源與免費資料策略不因本版改變。
