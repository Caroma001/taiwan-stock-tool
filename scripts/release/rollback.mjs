import { run } from "./common.mjs";

const target = process.argv[2];
if (!target) {
  console.log("Rollback is intentionally manual.");
  console.log("1. Open Vercel → taiwan-stock-tool → Deployments.");
  console.log("2. Copy the URL or deployment ID of the last known-good deployment.");
  console.log("3. Run: npm run rollback -- <deployment-url-or-id>");
  process.exit(0);
}

console.log(`⚠️ Rolling production back to: ${target}`);
run("npx", ["vercel", "rollback", target, "--yes"]);
console.log("✅ Rollback command completed. Run production verification next.");
