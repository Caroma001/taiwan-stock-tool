# twstock M8.6.4 — Portfolio Manager

完整獨立版本，核心新增：

- Portfolio Manager 投資組合管理頁 `/portfolio-manager`
- 新增、編輯、刪除持股批次
- 可修改買進價格、原始張數、剩餘張數、買進日期、費用、目標價與備註
- 登記部分或全部賣出，寫入歷史交易
- 自動依持股批次計算加權平均成本、目前市值、未實現損益與報酬率
- 全站 5 段字體：90%、100%、110%、120%、135%
- 表格密度：緊密、標準、舒適
- 顯示設定寫入 localStorage，跨頁保存
- 原 `/portfolio` 自動導向 `/portfolio-manager`

## 安裝

```bash
cd ~/Projects/twstock-M8.6.4
node scripts/link-shared-env.mjs
npm install
npm run build
npm run dev
```
