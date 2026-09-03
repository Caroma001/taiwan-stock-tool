# twstock-M8.7.3 — Display Manager

## 版本定位
改善 M8.7.2 右下角 `Aa` 按鈕過小、容易被捲軸遮擋且不易理解的問題。

## 完成功能
- 將顯示控制器移至全站頂部導覽列。
- 按鈕改名為「Aa 顯示設定」，具備 42px 以上點擊高度。
- 五段字體：90%、100%、110%、120%、135%。
- 三段表格密度：緊密、標準、舒適。
- 設定立即套用全站並保存至 localStorage。
- 新增清楚的中央 Modal、即時預覽、恢復預設與完成按鈕。
- 支援 Esc、背景點擊與右上角 × 關閉。
- 加入鍵盤 focus 樣式，改善桌機與 iPad 可操作性。

## 驗證與部署
```bash
cd ~/Projects/twstock-M8.7.3
node scripts/link-shared-env.mjs
npm install
npm run verify
npm run dev
```

首次部署此資料夾：
```bash
npx vercel link
```

正式部署：
```bash
npm run deploy
```
