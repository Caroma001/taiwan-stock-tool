import fs from "node:fs";
const read=(p)=>fs.readFileSync(p,"utf8");
const failures=[];
const pkg=JSON.parse(read("package.json"));
const version=JSON.parse(read("version.json"));
const scoring=read("lib/early-watch/scoring.ts");
const service=read("lib/early-watch/service.ts");
const panel=read("components/early-watch/EarlyWatchPanel.tsx");

if(pkg.version!=="8.12.3"||version.version!=="8.12.3") failures.push("version must be 8.11.10");
for(const token of [
  "LowBaseRiskLevel",
  "detectLowBaseRisk",
  "hyper-growth is capped",
  "revenueContinuity",
  "evidenceCount",
  "withoutCatalyst",
  "獨立證據",
  "低基期風險：高",
  "高分但未通過 EW-A 多證據確認",
]) if(!scoring.includes(token)) failures.push(`calibration scoring guard missing: ${token}`);
for(const token of [
  "MIN(MAX(COALESCE(yoy_pct,0),0),150)",
  "current_revenue",
  "last_year_revenue",
  "priorRevenueYoyPct",
  'const VERSION="M8.11.8"',
]) if(!service.includes(token)) failures.push(`calibration service guard missing: ${token}`);
if(!panel.includes("低基期高")||!panel.includes("校準版")) failures.push("Early Watch UI must expose calibration/low-base status");
if((service.match(/https:\/\//g)||[]).length>2) failures.push("M8.11.8 must not add public API endpoints");
if(service.includes("ALTER TABLE")) failures.push("M8.11.8 calibration must not require schema ALTER");

if(failures.length){console.error("❌ M8.11.8 Early Watch calibration guard failed");for(const f of failures)console.error("-",f);process.exit(1)}
console.log("✅ M8.11.8 Early Watch Calibration & Low-Base Guard passed.");
