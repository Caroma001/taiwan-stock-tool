import fs from "node:fs";
const read=p=>fs.readFileSync(p,"utf8"),exists=p=>fs.existsSync(p),fail=[];
const pkg=JSON.parse(read("package.json")),ver=JSON.parse(read("version.json"));
if(pkg.version!=="8.12.3"||ver.version!=="8.12.1")fail.push("version must be 8.12.1");
for(const p of ["migrations/turso/0040_m8122_quality_brucescore.ts","lib/m8121/quality-service.ts","lib/m8121/bruce-swing-score.ts","app/api/m8121/recover-report/route.ts","components/m8121/DataQualityPanel.tsx","app/bruce-score/page.tsx"])if(!exists(p))fail.push(`missing ${p}`);
const mig=read("migrations/turso/0040_m8122_quality_brucescore.ts");
if(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?daily_job_lock/i.test(mig))fail.push("M8.12.3 from M8.11.10 must not create daily_job_lock");
for(const x of ["daily_quality_snapshots","bruce_swing_score_daily"])if(!mig.includes(x))fail.push(`migration missing ${x}`);
const nav=read("app/components/MainNavigation.tsx"),dev=read("app/development-center/page.tsx"),upd=read("lib/development/update-service.ts");
if(!nav.includes('/bruce-score'))fail.push("Bruce Score nav missing");
if(!dev.includes("DataQualityPanel"))fail.push("Data Quality Panel missing");
if(!upd.includes("refreshBruceSwingScores"))fail.push("daily pipeline Bruce Score refresh missing");
if(fail.length){console.error("❌ M8.12.3 guard failed");for(const x of fail)console.error("-",x);process.exit(1)}
console.log("✅ M8.12.3 from M8.11.10 guard passed");
