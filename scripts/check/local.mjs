import { existsSync } from "node:fs";
import { loadEnvFile } from "../toolkit/env-loader.mjs";
import {
  createReporter,
  version,
  validateProjectStructure,
  validateGitSafety,
  validateRuntimeEnv,
  validateLocalToolchain,
} from "./shared.mjs";

const reporter = createReporter(`M${version} Local Doctor`);
console.log(`\ntwstock M${version} Local Doctor\n`);
console.log("ℹ️ Local Doctor checks only this computer. GitHub Actions and Vercel are checked separately.\n");

validateLocalToolchain(reporter);

if (!existsSync(".env.local")) {
  reporter.fail(
    ".env.local is missing",
    "Copy the previous version's .env.local or create it from .env.local.example",
  );
} else {
  reporter.pass(".env.local found");
  loadEnvFile(".env.local", { override: true });
  validateRuntimeEnv(reporter, ".env.local");
}

if (!process.env.MONITORING_SECRET?.trim()) {
  reporter.warn("MONITORING_SECRET is optional for local development");
} else {
  reporter.pass("MONITORING_SECRET configured locally");
}

validateProjectStructure(reporter);
validateGitSafety(reporter);
reporter.finish(`M${version} local development environment is ready`);
