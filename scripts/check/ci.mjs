import {
  createReporter,
  runCommand,
  version,
  validateProjectStructure,
  validateCiWorkflow,
  validateGitSafety,
} from "./shared.mjs";

const reporter = createReporter(`M${version} CI Check`);
console.log(`\ntwstock M${version} CI Check\n`);
console.log("ℹ️ CI does not read .env.local and does not require production secrets.\n");

validateProjectStructure(reporter);
validateCiWorkflow(reporter);
validateGitSafety(reporter);
reporter.finish(`M${version} static CI preflight passed`);

const buildEnv = {
  ...process.env,
  CI: "true",
  TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL || "libsql://ci-placeholder.invalid",
  TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN || "ci-placeholder-token",
  APP_ACCESS_PASSWORD: process.env.APP_ACCESS_PASSWORD || "ci-placeholder-password",
  AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET || "ci-placeholder-session-secret",
  CLOUD_ADMIN_SECRET: process.env.CLOUD_ADMIN_SECRET || "ci-placeholder-cloud-secret",
  CRON_SECRET: process.env.CRON_SECRET || "ci-placeholder-cron-secret",
  MONITORING_SECRET: process.env.MONITORING_SECRET || "ci-placeholder-monitoring-secret",
};

const commands = [
  ["Algorithm tests", "node", ["scripts/tests/algorithm.mjs"]],
  ["Pipeline compile", "npm", ["run", "compile:pipeline"]],
  ["TypeScript", "npm", ["run", "typecheck"]],
  ["Production build", "npm", ["run", "build"]],
];

for (const [label, command, args] of commands) {
  if (!runCommand(label, command, args, reporter, { env: buildEnv })) process.exit(1);
}

console.log(`\n✅ M${version} CI Ready for Vercel Git Deployment`);
