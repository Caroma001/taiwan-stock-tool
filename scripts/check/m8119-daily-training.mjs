import fs from "node:fs";
const read=(p)=>fs.readFileSync(p,"utf8");
const exists=(p)=>fs.existsSync(p);
const failures=[];
const pkg=JSON.parse(read("package.json"));
const version=JSON.parse(read("version.json"));
if(pkg.version!=="8.12.3"||version.version!=="8.12.3")failures.push("version must be 8.11.10");
for(const p of ["lib/daily-report/service.ts","app/api/daily-report/route.ts","app/api/scheduled/daily-close/route.ts","migrations/turso/0038_daily_training_export.ts","app/daily-lab/page.tsx"])if(!exists(p))failures.push(`missing ${p}`);
const service=read("lib/daily-report/service.ts");
const market=read("lib/market/service.ts");
const page=read("app/daily-lab/page.tsx");
const migration=read("migrations/turso/0038_daily_training_export.ts");
const vercel=JSON.parse(read("vercel.json"));
const scheduled=read("app/api/scheduled/daily-close/route.ts");
for(const token of ["TRAINING_SCHEMA","hit5PctBy5d","hit8PctBy10d","hitStopLossBy10d","availableFutureSessions","daily_report_export_status","15:00"]){if(!service.includes(token))failures.push(`training service missing ${token}`)}
if(!market.includes("maxAbsMove")||!market.includes("latest.close <= 0"))failures.push("market quote anomaly guard missing");
for(const token of ["JSON 訓練檔","尚未下載","15:00","策略訓練資料說明","twst-stock-data"]){if(!page.includes(token))failures.push(`daily UI missing ${token}`)}
if(/ALTER TABLE/i.test(migration))failures.push("migration 38 must be additive only");
const cron=Array.isArray(vercel.crons)?vercel.crons:[];
if(cron.length!==1||cron[0]?.path!=="/api/scheduled/daily-close"||cron[0]?.schedule!=="0 7 * * 1-5")failures.push("approved 15:00 Taipei cron missing");
if(scheduled.includes("CRON_SECRET")||scheduled.includes("authorization"))failures.push("scheduled close route must remain password-free in M8.11.10");
if(failures.length){console.error("❌ M8.11.10 Daily Training guard failed");for(const f of failures)console.error("-",f);process.exit(1)}
console.log("✅ M8.11.10 15:00 Daily Dataset Lock & Password-Free Cron guard passed.");
