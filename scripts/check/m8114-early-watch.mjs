import fs from "node:fs";
const read=(p)=>fs.readFileSync(p,"utf8");
const exists=(p)=>fs.existsSync(p);
const failures=[];
const pkg=JSON.parse(read("package.json"));
const version=JSON.parse(read("version.json"));
const service=read("lib/early-watch/service.ts");
const scoring=read("lib/early-watch/scoring.ts");
const panel=read("components/early-watch/EarlyWatchPanel.tsx");
const update=read("lib/development/update-service.ts");
const swing=read("app/swing10/page.tsx");
const migration=read("migrations/turso/0036_early_watch.ts");
const migrationIndex=read("migrations/turso/index.ts");

if(pkg.version!=="8.12.3"||version.version!=="8.12.3") failures.push("version must be 8.11.10");
for(const p of ["lib/early-watch/service.ts","lib/early-watch/scoring.ts","app/api/early-watch/route.ts","app/api/early-watch/refresh/route.ts","app/api/early-watch/catalyst/route.ts","components/early-watch/EarlyWatchPanel.tsx","migrations/turso/0036_early_watch.ts"]) if(!exists(p)) failures.push(`missing ${p}`);
for(const token of ["monthly_revenue_history","early_watch_catalyst_events","early_watch_daily","early_watch_refresh_runs"]) if(!migration.includes(token)) failures.push(`migration table missing: ${token}`);
if(!migrationIndex.includes("earlyWatchMigration")) failures.push("migration 36 not registered");
for(const token of ["TWSE_REVENUE_URL","t187ap05_L.csv","t187ap05_O.csv","SNAPSHOT_LIMIT=30","PREFILTER_LIMIT=160","candidateUniverse","refreshEarlyWatch","sourceConfidencePct"]) if(!service.includes(token)) failures.push(`Early Watch service guard missing: ${token}`);
for(const token of ["fundamentalScore","priceNotPricedScore","accumulationScore","EW-A","EW-B"]) if(!scoring.includes(token)) failures.push(`scoring guard missing: ${token}`);
if(!update.includes("refreshEarlyWatch(chipDb, targetTradeDate)")) failures.push("daily pipeline must refresh Early Watch once");
if(!swing.includes("EarlyWatchPanel")) failures.push("Swing10 must surface Early Watch panel");
if(panel.includes("實際買入")||panel.includes("加入測試")) failures.push("Early Watch must remain observation-only and never create trade positions directly");
if((service.match(/https:\/\//g)||[]).length>2) failures.push("Early Watch must not add more than two public endpoints");
if(!service.includes("filter(row=>row.tier!==\"PASS\")")) failures.push("only meaningful Early Watch rows should be persisted");

if(failures.length){console.error("❌ M8.11.4 Early Watch guard failed");for(const f of failures)console.error("-",f);process.exit(1)}
console.log("✅ M8.11.4 Early Watch / Catalyst / low-read guard passed.");
