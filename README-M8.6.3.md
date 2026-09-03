# twstock-M8.6.3 — Vercel Cloud Queue Edition

本版將網站部署與每日更新工作移至 Vercel。按下「每日一鍵更新」後，系統會在 Turso 建立可續傳工作，再交由 Vercel Queues 分批處理；MacBook、瀏覽器或 iPad 關閉後，已送出的雲端工作仍可持續。

## 架構

- Vercel：Next.js 網站、API、Queue Consumer
- Vercel Queues：持久化背景工作、失敗重試
- Turso：股票資料、分析結果、工作進度與斷點
- FinMind：只由後端 Worker 呼叫，畫面只讀 Turso

## Vercel 環境變數

必要：

- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `FINMIND_TOKEN`
- `APP_RUNTIME_MODE=production`
- `DEVELOPMENT_MODE=false`
- `CLOUD_AUTOMATION_ENABLED=true`
- `VERCEL_CRON_ENABLED=false`
- `EMAIL_AUTOMATION_ENABLED=false`
- `GIT_DEPLOYMENT_ENABLED=true`

## 部署

```bash
npm install
npm run build
npx vercel link
npx vercel env pull .env.vercel.local
npx vercel --prod
```

或推送至已連結的 GitHub repository，由 Vercel 自動部署。

## 安全與費用

- 本版沒有啟用 Vercel Cron，不會定時自動跑。
- 只有使用者按下「每日一鍵更新」才會建立 Queue 工作。
- Queue 與 Function 仍會產生 Vercel 用量，請在 Usage 頁查看。
- Queue 採至少一次投遞；Turso 工作表與主鍵負責去重，因此重送不會從 0 重新下載。
