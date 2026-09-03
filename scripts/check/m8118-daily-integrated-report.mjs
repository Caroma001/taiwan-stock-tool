import fs from "node:fs";
const read=(p)=>fs.readFileSync(p,"utf8");
const exists=(p)=>fs.existsSync(p);
const failures=[];
const pkg=JSON.parse(read("package.json"));
const version=JSON.parse(read("version.json"));
if(pkg.version!=="8.12.3"||version.version!=="8.12.3")failures.push("version must be 8.11.10");
for(const p of ["lib/daily-report/service.ts","app/api/daily-report/route.ts","app/daily-lab/page.tsx","migrations/turso/0037_daily_integrated_report.ts"])if(!exists(p))failures.push(`missing ${p}`);
const migration=read("migrations/turso/0037_daily_integrated_report.ts");
const index=read("migrations/turso/index.ts");
const service=read("lib/daily-report/service.ts");
const page=read("app/daily-lab/page.tsx");
const update=read("lib/development/update-service.ts");
if(!migration.includes("daily_analysis_reports"))failures.push("daily report table missing");
if(/ALTER TABLE/i.test(migration))failures.push("migration 37 must be additive CREATE TABLE/INDEX only");
if(!index.includes("dailyIntegratedReportMigration"))failures.push("migration 37 not registered");
for(const token of ["market_regime_daily","market_quotes_daily","market_index_daily","early_watch_daily","swing10_candidate_daily","swing10_exit_alert_daily","Fast5","5–10"]){if(!service.includes(token))failures.push(`report service missing ${token}`)}
if(/fetch\s*\(/.test(service))failures.push("daily report service must not add external HTTP fetches; reuse persisted data");
if(!page.includes("/api/daily-report"))failures.push("home must read integrated daily report API");
if(page.includes("setInterval"))failures.push("daily report must not poll Turso continuously");
for(const token of ["下載 TXT 摘要","下載 JSON","複製摘要","大盤＋國際風向","Early Watch Top5","Swing10 相對 Top5"]){if(!page.includes(token))failures.push(`report UI missing ${token}`)}
if(!update.includes("generateDailyIntegratedReport"))failures.push("daily pipeline must generate report after analysis");
if(failures.length){console.error("❌ M8.11.8 Daily Integrated Report guard failed");for(const f of failures)console.error("-",f);process.exit(1)}
console.log("✅ M8.11.8 Daily Integrated Report & Fast5 guard passed.");
