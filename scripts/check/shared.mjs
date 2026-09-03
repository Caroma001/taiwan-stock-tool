import { spawnSync, execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const pkg = JSON.parse(readFileSync("package.json", "utf8"));
export const version = pkg.version;

export function createReporter(title) {
  const failures = [];
  const warnings = [];
  const pass = (label) => console.log(`✅ ${label}`);
  const fail = (label, fix = "") => {
    failures.push({ label, fix });
    console.error(`❌ ${label}`);
  };
  const warn = (label) => {
    warnings.push(label);
    console.warn(`⚠️ ${label}`);
  };
  const requireFile = (file) => existsSync(file) ? pass(file) : fail(file, `Restore ${file}`);
  const finish = (successMessage) => {
    if (failures.length) {
      console.error(`\n❌ ${title} stopped with ${failures.length} issue(s).`);
      for (const item of failures) {
        console.error(`- ${item.label}${item.fix ? ` | Fix: ${item.fix}` : ""}`);
      }
      process.exit(1);
    }
    console.log(`\n✅ ${successMessage}`);
    if (warnings.length) console.log(`ℹ️ ${warnings.length} non-blocking warning(s).`);
  };
  return { failures, warnings, pass, fail, warn, requireFile, finish };
}

export function runCommand(label, command, args, reporter, options = {}) {
  console.log(`\n▶ ${label}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: options.env ?? process.env,
  });
  if (result.status !== 0) {
    reporter.fail(`${label} failed`, `${command} ${args.join(" ")}`);
    return false;
  }
  reporter.pass(label);
  return true;
}

export function validateProjectStructure(reporter) {
  for (const file of [
    "package.json", "version.json", "vercel.json",
    "lib/turso/client.ts",
    "app/api/health/route.ts", "app/api/ready/route.ts",
    "app/api/development/update/start/route.ts",
    "app/api/development/update/status/route.ts",
    "app/api/queues/twstock-daily-update/route.ts",
    "app/daily-lab/page.tsx", "app/smart-selection/page.tsx",
    "app/portfolio-manager/page.tsx", "app/strategy-guide/page.tsx",
    "app/manifest.ts", "public/sw.js",
    "public/icon-192.png", "public/icon-512.png", "public/apple-touch-icon.png",
    "tsconfig.pipeline-runtime.json", "scripts/cli/pipeline-cli.ts",
  ]) reporter.requireFile(file);

  if (!/^\d+\.\d+\.\d+$/.test(version)) reporter.fail(`Invalid package version: ${version}`);
  else reporter.pass(`package version ${version}`);

  if (existsSync("version.json")) {
    const state = JSON.parse(readFileSync("version.json", "utf8"));
    state.version === version
      ? reporter.pass("version.json matches package.json")
      : reporter.fail("version.json mismatch", "Update package.json and version.json together");
  }

  const forbidden = [
    "app/ai-engine", "app/ai-scanner", "app/decision-engine",
    "app/api/validation", "app/api/m72", "app/daily-lab/page.backup.tsx",
  ];
  for (const file of forbidden) {
    existsSync(file) ? reporter.fail(`obsolete module remains: ${file}`) : reporter.pass(`obsolete module removed: ${file}`);
  }
}

export function readWorkflows() {
  const dir = ".github/workflows";
  if (!existsSync(dir)) return "";
  return readdirSync(dir)
    .filter((file) => /\.ya?ml$/.test(file))
    .map((file) => readFileSync(join(dir, file), "utf8"))
    .join("\n");
}

export function validateCiWorkflow(reporter) {
  const workflows = readWorkflows();
  const permanentChecks = [
    [/npm\s+run\s+(?:ci-check|check)\b/, "GitHub CI runs the permanent CI check"],
    [/TWSTOCK_PRODUCTION_URL/, "production URL is supplied through GitHub Secrets"],
    [/\/api\/health|for\s+endpoint\s+in\s+health\s+ready/i, "production health check"],
  ];

  for (const [pattern, label] of permanentChecks) {
    pattern.test(workflows)
      ? reporter.pass(label)
      : reporter.fail(label, "Restore the permanent CI capability");
  }

  // M8.10.22 architecture intentionally disables GitHub/Vercel Cron and does
  // not duplicate Vercel deployment. Durable continuation is handled by Vercel Queue.
  existsSync("app/api/ready/route.ts")
    ? reporter.pass("production readiness route available")
    : reporter.fail("production readiness route missing");

  if (/vercel(?:@[^\s]+)?\s+(?:deploy|pull|build)|npx\s+[^\n]*vercel[^\n]*(?:deploy|pull|build)/i.test(workflows)) {
    reporter.fail("GitHub workflow still performs Vercel CLI deployment", "Deployment must remain outside GitHub Actions");
  } else {
    reporter.pass("GitHub workflow does not duplicate Vercel deployment");
  }

  const hasScheduledContinuation = /schedule\s*:/i.test(workflows) && /cron\s*:/i.test(workflows);
  if (hasScheduledContinuation) {
    reporter.fail("GitHub scheduled continuation is enabled", "M8.10.22 uses Vercel Queue + browser watchdog; disable scheduled Actions");
  } else if (existsSync("app/api/queues/twstock-daily-update/route.ts")) {
    reporter.pass("Vercel Queue continuation configured; GitHub scheduler disabled");
  } else {
    reporter.fail("Vercel Queue continuation route missing");
  }

  if (existsSync("vercel.json")) {
    const config = JSON.parse(readFileSync("vercel.json", "utf8"));
    const crons = Array.isArray(config.crons) ? config.crons : [];
    crons.length === 0
      ? reporter.pass("Vercel Cron intentionally disabled")
      : reporter.fail("Vercel Cron is enabled", "M8.10.22 uses Vercel Queue continuation without Cron");
    Array.isArray(config.regions) && config.regions.includes("hnd1")
      ? reporter.pass("Tokyo Vercel region configured")
      : reporter.warn("Tokyo Vercel region is not explicitly configured");
  }
}
export function validateLocalToolchain(reporter) {
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (Number.isFinite(nodeMajor) && nodeMajor >= 20) {
    reporter.pass(`Node.js ${process.versions.node}`);
  } else {
    reporter.fail(`Unsupported Node.js ${process.versions.node}`, "Install Node.js 20 or newer");
  }

  try {
    const npmVersion = execFileSync("npm", ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    reporter.pass(`npm ${npmVersion}`);
  } catch {
    reporter.fail("npm is unavailable", "Install npm with Node.js");
  }

  existsSync("node_modules")
    ? reporter.pass("node_modules found")
    : reporter.fail("node_modules is missing", "Run npm install");
}

export function validateGitSafety(reporter, { requireRepository = false } = {}) {
  try {
    const ignored = execFileSync("git", ["check-ignore", ".env.local"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    ignored ? reporter.pass(".env.local is ignored by Git") : reporter.fail(".env.local is not ignored");
    const remote = execFileSync("git", ["remote", "get-url", "origin"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    remote ? reporter.pass("Git origin configured") : reporter.fail("Git origin missing");
  } catch {
    requireRepository
      ? reporter.fail("Git repository is not initialized", "Run git init and configure origin")
      : reporter.warn("Git repository is not initialized yet; acceptable before the first push");
  }
}

export const requiredRuntimeEnv = [
  "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN",
  "CLOUD_ADMIN_SECRET",
];

export function validateRuntimeEnv(reporter, sourceLabel = "environment") {
  const longSecrets = new Set(["CLOUD_ADMIN_SECRET"]);
  for (const key of requiredRuntimeEnv) {
    const value = process.env[key]?.trim() ?? "";
    if (!value) reporter.fail(`${key} is missing`, `Configure it in ${sourceLabel}`);
    else if (longSecrets.has(key) && value.length < 12) reporter.fail(`${key} is too short`, "Use at least 12 unique characters");
    else reporter.pass(`${key} configured`);
  }
}
