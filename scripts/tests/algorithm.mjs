import { spawnSync } from "node:child_process";
for (const file of ["scripts/tests/scoring.mjs", "scripts/tests/market-context.mjs"]) {
  const r = spawnSync("node", [file], { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
console.log("✅ Permanent algorithm test suite passed");
