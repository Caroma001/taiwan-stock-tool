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
    "package.json", "version.json", "vercel.json", "proxy.ts",
    "lib/turso/client.ts", "lib/auth/session.ts",
    "app/api/health/route.ts", "app/api/ready/route.ts",
    "app/api/auth/login/route.ts", "app/api/auth/logout/route.ts",
    "app/api/cron/daily/route.ts", "app/api/cloud/worker/route.ts",
    "app/cloud/page.tsx", "app/manifest.ts", "public/sw.js",
    "public/icon-192.png", "public/icon-512.png", "public/apple-touch-icon.png",
    "app/offline/page.tsx", "tsconfig.pipeline-runtime.json",
    "tsconfig.algorithm-test.json", "scripts/cli/pipeline-cli.ts",
  ]) reporter.requireFile(file);

  if (!/^\d+\.\d+\.\d+$/.test(version)) reporter.fail(`Invalid package version: ${version}`);
  else reporter.pass(`package version ${version}`);

  if (existsSync("version.json")) {
    const state = JSON.parse(readFileSync("version.json", "utf8"));
    state.version === version
      ? reporter.pass("version.json matches package.json")
      : reporter.fail("version.json mismatch", "Update package.json and version.json together");
  }

  const manifest = existsSync("app/manifest.ts") ? readFileSync("app/manifest.ts", "utf8") : "";
  if (/purpose\s*:\s*["']any\s+maskable["']/i.test(manifest)) {
    reporter.fail('PWA purpose "any maskable" is forbidden', 'Use purpose: "maskable".');
  } else reporter.pass("PWA manifest uses Next.js-compatible icon purpose");

  const activeFiles = [
    "package.json", "tsconfig.pipeline-runtime.json", "tsconfig.algorithm-test.json",
    "scripts/tests/scoring.mjs", "scripts/tests/market-context.mjs",
    "scripts/pipeline/prepare-runtime.mjs",
  ];
  const retiredReference = /(?:m61|m62|m69|m74|M61|M62|M69|M74|tsconfig\.m)/;
  for (const file of activeFiles) {
    if (!existsSync(file)) continue;
    if (retiredReference.test(readFileSync(file, "utf8"))) {
      reporter.fail(`retired version reference remains in ${file}`, "Use permanent runtime names");
    }
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
  const capabilities = [
    [/npm\s+run\s+(?:ci-check|check)\b/, "GitHub CI runs the permanent CI check"],
    [/TWSTOCK_PRODUCTION_URL/, "production URL is supplied through GitHub Secrets"],
    [/\/api\/health|for\s+endpoint\s+in\s+health\s+ready/i, "production health check"],
    [/\/api\/ready|for\s+endpoint\s+in\s+health\s+ready/i, "production readiness check"],
    [/Vercel Git Integration|git deployment|wait-for-vercel/i, "Vercel Git deployment observation"],
  ];

  for (const [pattern, label] of capabilities) {
    pattern.test(workflows)
      ? reporter.pass(label)
      : reporter.fail(label, "Restore the M7.8.5 GitHub workflow capability");
  }

  if (/vercel(?:@[^\s]+)?\s+(?:deploy|pull|build)|npx\s+[^\n]*vercel[^\n]*(?:deploy|pull|build)/i.test(workflows)) {
    reporter.fail(
      "GitHub workflow still performs Vercel CLI deployment",
      "M7.8.5 delegates deployment to Vercel Git Integration",
    );
  } else {
    reporter.pass("GitHub workflow does not duplicate Vercel deployment");
  }

  const continuation = /schedule\s*:/i.test(workflows)
    && /cron\s*:/i.test(workflows)
    && /\/api\/cloud\/worker/i.test(workflows);
  continuation
    ? reporter.pass("cloud continuation scheduler")
    : reporter.fail("cloud continuation scheduler");

  if (existsSync("vercel.json")) {
    const config = JSON.parse(readFileSync("vercel.json", "utf8"));
    const cron = config.crons?.find((entry) => entry.path === "/api/cron/daily");
    cron
      ? reporter.pass(`Daily Cron configured: ${cron.schedule}`)
      : reporter.fail("Daily Cron missing");
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
  "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "APP_ACCESS_PASSWORD",
  "AUTH_SESSION_SECRET", "CLOUD_ADMIN_SECRET", "CRON_SECRET",
];

export function validateRuntimeEnv(reporter, sourceLabel = "environment") {
  const longSecrets = new Set(["APP_ACCESS_PASSWORD", "AUTH_SESSION_SECRET", "CLOUD_ADMIN_SECRET", "CRON_SECRET"]);
  for (const key of requiredRuntimeEnv) {
    const value = process.env[key]?.trim() ?? "";
    if (!value) reporter.fail(`${key} is missing`, `Configure it in ${sourceLabel}`);
    else if (longSecrets.has(key) && value.length < 12) reporter.fail(`${key} is too short`, "Use at least 12 unique characters");
    else reporter.pass(`${key} configured`);
  }
}
