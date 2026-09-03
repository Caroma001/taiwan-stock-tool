import fs from "node:fs";
const failures=[];
const route=fs.readFileSync("app/api/scheduled/daily-close/route.ts","utf8");
const shared=fs.readFileSync("scripts/check/shared.mjs","utf8");
const pkg=JSON.parse(fs.readFileSync("package.json","utf8"));
const version=JSON.parse(fs.readFileSync("version.json","utf8"));
if(pkg.version!=="8.12.3"||version.version!=="8.12.3") failures.push("version must be 8.11.10");
if(/CRON_SECRET|authorization/i.test(route)) failures.push("daily-close must not require a password or authorization header");
if(!route.includes("before_1500_taipei")||!route.includes("market_closed")) failures.push("trading-day and 15:00 safety gates must remain");
if(!route.includes("reset: false")) failures.push("scheduled close must remain idempotent and non-resetting");
if(shared.includes('"CRON_SECRET"')) failures.push("CRON_SECRET must not be a required runtime env");
if(failures.length){console.error("❌ M8.11.10 password-free cron guard failed");for(const f of failures)console.error("-",f);process.exit(1)}
console.log("✅ M8.11.10 password-free 15:00 cron guard passed.");
