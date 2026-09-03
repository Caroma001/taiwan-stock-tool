import fs from "node:fs";
const read=(p)=>fs.readFileSync(p,"utf8");
const failures=[];
const pkg=JSON.parse(read("package.json"));
const version=JSON.parse(read("version.json"));
const overview=read("app/api/portfolio/overview/route.ts");
const watchRoute=read("app/api/portfolio/watch/route.ts");
const watchlistRoute=read("app/api/watchlist/route.ts");
const page=read("app/portfolio-manager/page.tsx");
const early=read("components/early-watch/EarlyWatchPanel.tsx");

if(pkg.version!=="8.12.3"||version.version!=="8.12.3") failures.push("version must be 8.11.10");
for(const token of [
  "Unified Watchlist Source of Truth",
  "FROM watchlist w",
  "FROM hot_stock_candidates h",
  "source_priority",
  "unifiedBySymbol",
  "watch_source",
  "Early Watch EW-A",
]) if(!overview.includes(token)) failures.push(`overview unified-watch guard missing: ${token}`);
for(const token of ["DELETE FROM watchlist", "UPDATE hot_stock_candidates", "unified: true"]) if(!watchRoute.includes(token)) failures.push(`portfolio cancel guard missing: ${token}`);
if(!watchlistRoute.includes("UPDATE hot_stock_candidates")) failures.push("watchlist DELETE must clear legacy hot-stock source too");
for(const token of ["來源","watch_source","Early Watch / 自選觀察","取消觀察"]) if(!page.includes(token)) failures.push(`portfolio UI guard missing: ${token}`);
if(!early.includes('現在可在「投資組合」統一觀察')) failures.push("Early Watch add confirmation must point user to Portfolio");
if(overview.includes("ALTER TABLE")||watchRoute.includes("ALTER TABLE")) failures.push("M8.11.8 must not require schema ALTER");
if(fs.existsSync("migrations/turso/0037_unified_watchlist.ts")) failures.push("M8.11.8 must not add migration 37");

if(failures.length){console.error("❌ M8.11.8 Unified Watchlist guard failed");for(const f of failures)console.error("-",f);process.exit(1)}
console.log("✅ M8.11.8 Unified Watchlist Source of Truth guard passed.");
