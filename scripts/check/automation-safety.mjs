import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];
const workflows = [
  ".github/workflows/ci-cd.yml",
  ".github/workflows/cloud-scheduler.yml",
  ".github/workflows/production-health.yml",
];

for (const rel of workflows) {
  const path = resolve(root, rel);
  if (!existsSync(path)) continue;
  const text = readFileSync(path, "utf8");
  if (/^\s*schedule\s*:/m.test(text) || /^\s*-\s*cron\s*:/m.test(text)) {
    failures.push(`${rel}: GitHub automatic schedule/cron remains disabled; M8.11.10 uses one approved Vercel close cron only`);
  }
  if (/^\s*push\s*:/m.test(text)) failures.push(`${rel}: push trigger is not allowed in Development Mode`);
}

const vercelPath = resolve(root, "vercel.json");
if (existsSync(vercelPath)) {
  const config = JSON.parse(readFileSync(vercelPath, "utf8"));
  const crons = Array.isArray(config.crons) ? config.crons : [];
  if (crons.length !== 1 || crons[0]?.path !== "/api/scheduled/daily-close" || crons[0]?.schedule !== "0 7 * * 1-5") {
    failures.push("vercel.json: only the approved weekday 07:00 UTC / 15:00 Asia-Taipei daily-close cron is allowed");
  }
  if (config.git?.deploymentEnabled !== false) failures.push("vercel.json: git.deploymentEnabled must remain false during development");
}

if (failures.length) {
  console.error("M8.11.10 automation safety check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("M8.11.10 automation safety check passed.");
console.log("GitHub schedules: disabled");
console.log("Vercel Daily Close Cron: approved at 15:00 Asia/Taipei, weekdays only");
console.log("Git auto deployment: disabled");
