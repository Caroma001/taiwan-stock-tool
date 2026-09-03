import fs from "node:fs";
import path from "node:path";
const read=(p)=>fs.readFileSync(p,"utf8");
const exists=(p)=>fs.existsSync(p);
const failures=[];

const pkg=JSON.parse(read("package.json"));
const version=JSON.parse(read("version.json"));
const exitRules=read("lib/swing10/exit-rules.ts");
const trade=read("lib/swing10/trade-execution.ts");
const nav=read("app/components/MainNavigation.tsx");
const home=read("app/daily-lab/page.tsx");
const legacyPage=read("app/stealth-scanner/page.tsx");

if(pkg.version!=="8.12.3" || version.version!=="8.12.3") failures.push("M8.11.3 cleanup invariants must remain present in M8.11.10");
if(exists("app/api/stealth-scanner")) failures.push("legacy app/api/stealth-scanner directory must be removed");
if(exists("lib/stealth-scanner/service.ts")) failures.push("legacy lib/stealth-scanner/service.ts must be removed");
if(!exists("lib/institutional-stealth/service.ts")) failures.push("institutional stealth core service must be preserved under lib/institutional-stealth");
if(nav.includes('/stealth-scanner') || nav.includes('label: "潛伏雷達"')) failures.push("main navigation must not expose Stealth Radar");
if(home.includes('/api/stealth-scanner') || home.includes('href="/stealth-scanner"')) failures.push("decision home must not call/link legacy Stealth Radar");
if(!legacyPage.includes('redirect("/swing10")') || legacyPage.includes('use client')) failures.push("legacy /stealth-scanner route must be redirect-only");

for(const token of [
  "Hard exits",
  "confirmations.length >= 2",
  "大盤風險高（僅作市場背景，不單獨觸發賣出）",
  "等待第二項確認",
  "confirmationCount",
]) if(!exitRules.includes(token)) failures.push(`multi-confirm exit rule missing: ${token}`);
if(exitRules.includes('sell.push(`決策分較進場下降')) failures.push("Decision decline must not directly push a red sell alert");
if(!trade.includes('refreshInstitutionalStealth(symbols,symbols.length)')) failures.push("held positions must retain continuity scoring after leaving Top20");
if(!trade.includes('current_market_risk_score:null') || !trade.includes('current_daytrade_noise_penalty:null')) failures.push("position continuity typed fallback must remain complete");

if(failures.length){console.error("❌ M8.11.3 cleanup / multi-confirm guard failed");for(const f of failures) console.error("-",f);process.exit(1)}
console.log("✅ M8.11.3 legacy Stealth UI cleanup + multi-confirm Exit Alert guard passed.");
