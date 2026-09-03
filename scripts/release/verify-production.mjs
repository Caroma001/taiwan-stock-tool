import { resolveProductionUrl } from "./common.mjs";

const base = resolveProductionUrl();
if (!base) {
  console.error("❌ Missing TWSTOCK_PRODUCTION_URL or PRODUCTION_URL.");
  console.error("Example: TWSTOCK_PRODUCTION_URL=https://taiwan-stock-tool-sable.vercel.app npm run production:verify");
  process.exit(1);
}

const checks = [
  ["Homepage", "/"],
  ["投資組合", "/portfolio-manager"],
  ["Portfolio Manager", "/portfolio-manager"],
  ["Top 30", "/daily-lab"],
  ["Health API", "/api/health"],
  ["Ready API", "/api/ready"],
];

let failed = 0;
for (const [label, route] of checks) {
  const url = `${base}${route}`;
  try {
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30000) });
    if (!response.ok) {
      failed += 1;
      console.error(`❌ ${label}: HTTP ${response.status} — ${url}`);
    } else console.log(`✅ ${label}: HTTP ${response.status}`);
  } catch (error) {
    failed += 1;
    console.error(`❌ ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
if (failed) process.exit(1);
console.log(`\n✅ Production smoke test passed: ${base}`);
