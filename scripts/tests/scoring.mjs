import { existsSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";

const runtimeDir = ".runtime/pipeline";
if (existsSync(runtimeDir)) rmSync(runtimeDir, { recursive: true, force: true });
execFileSync("tsc", ["-p", "tsconfig.pipeline-runtime.json"], { stdio: "inherit" });
execFileSync("node", ["scripts/pipeline/prepare-runtime.mjs"], { stdio: "inherit" });

const scoring = await import(new URL("../../.runtime/pipeline/services/scoring/ScoringEngine.js", import.meta.url));
const decision = await import(new URL("../../.runtime/pipeline/services/scoring/DecisionEngine.js", import.meta.url));
const row = {
  symbol: "2330", trade_date: "2026-07-31", close: 100,
  ma5: 102, ma10: 101, ma20: 98, ma60: 90, ma120: 85, ma240: 80,
  volume_ma5: 150, volume_ma20: 100, rsi14: 60, k: 70, d: 62,
  macd: 1, macd_signal: 0.5, macd_histogram: 0.5,
  bollinger_upper: 110, bollinger_middle: 98, bollinger_lower: 86,
  atr14: 3, calculated_at: new Date().toISOString()
};
const result = scoring.scoreIndicator(row);
const plan = decision.createDecision(row, result);
if (result.totalScore < 70) throw new Error("Scoring test failed");
if (!plan.target1 || !plan.stopLoss || plan.target1 <= 100 || plan.stopLoss >= 100) {
  throw new Error("Decision test failed");
}
console.log("✅ scoring engine");
console.log("✅ exit targets and stop-loss");
console.log("✅ pipeline TypeScript compile");
