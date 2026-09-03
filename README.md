# twstock-M8.10.12

Bruce TW Stock AI Decision Center — M8.10.12 Turso Efficiency Edition.

Current release notes: `README-M8.10.12.md`.

本版不增加選股功能；唯一目標是降低 Turso Rows Read。每日更新保留潛伏雷達、Winner25 Top40 live scoring、固定 Top20 Cohort、Vercel Queue 自動續傳，以及 GitHub Actions / Vercel Cron 關閉原則。

```bash
cd ~/Projects/twstock-M8.10.12
node scripts/link-shared-env.mjs
npm install
rm -rf .next
npm run build
npm run verify
npm run dev
```
