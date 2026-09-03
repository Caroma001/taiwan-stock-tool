import fs from "node:fs";
const read=(p)=>fs.readFileSync(p,"utf8");
const failures=[];
const pkg=JSON.parse(read("package.json"));
const version=JSON.parse(read("version.json"));
const page=read("app/portfolio-manager/page.tsx");
const overview=read("app/api/portfolio/overview/route.ts");

if(pkg.version!=="8.12.3"||version.version!=="8.12.3") failures.push("version must be 8.11.10");
for(const token of [
  "💰 實際投資績效",
  "🧪 Swing10 測試績效",
  "👀 Early Watch / 自選觀察",
  "管理實際持股",
  "管理測試部位",
  "管理觀察池",
  "歷史 Top20 Cohort 已移出即時儀表板",
  'type Filter = "all" | "real" | "test" | "watch"',
]) if(!page.includes(token)) failures.push(`portfolio UI alignment missing: ${token}`);
if(page.includes("/api/portfolio/stealth-test-pool")) failures.push("Portfolio dashboard must not fetch legacy Top20 Cohort on load");
if(page.includes("createNextCohort")) failures.push("Portfolio dashboard must not create legacy Cohort from live dashboard");
for(const token of [
  "isLegacyCohort",
  'startsWith("stealth-radar-top20")',
  "swing10TestRows",
  "swing10Test",
  "realizedSummary",
  "averageReturnPct",
  "earlyWatchA",
  "earlyWatchB",
]) if(!overview.includes(token)) failures.push(`portfolio overview alignment missing: ${token}`);
if(!overview.includes('summary: { real, swing10Test, watch }')) failures.push("overview summary must expose real/swing10Test/watch only");
if(overview.includes("ALTER TABLE")) failures.push("M8.11.8 must not require schema ALTER");
if(fs.existsSync("migrations/turso/0037_portfolio_dashboard_alignment.ts")) failures.push("M8.11.8 must not add migration 37");

if(failures.length){console.error("❌ M8.11.8 Portfolio Dashboard Alignment guard failed");for(const f of failures)console.error("-",f);process.exit(1)}
console.log("✅ M8.11.8 Portfolio Dashboard Alignment guard passed.");
