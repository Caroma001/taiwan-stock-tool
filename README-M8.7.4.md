# twstock-M8.7.4 — Responsive UI Engine

M8.7.4 將 Display Manager 擴充為全站響應式顯示引擎。主導覽、熱門股候選池、所有資料表、按鈕和輸入框會共同套用顯示設定。

## Install

```bash
cd ~/Projects/twstock-M8.7.4
node scripts/link-shared-env.mjs
npm install
npm run verify
npm run dev
```

## Deploy

```bash
npx vercel link
npm run deploy
```

第一次連結時選擇既有的 `taiwan-stock-tool`。
