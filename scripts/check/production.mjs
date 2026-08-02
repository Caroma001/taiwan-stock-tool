import { createReporter, version, validateRuntimeEnv } from "./shared.mjs";

const reporter = createReporter(`M${version} Production Environment Check`);
console.log(`\ntwstock M${version} Production Environment Check\n`);
validateRuntimeEnv(reporter, "Vercel Production Environment Variables");
if (!process.env.MONITORING_SECRET?.trim()) {
  reporter.fail("MONITORING_SECRET is missing", "Add it to Vercel Production Environment Variables");
} else reporter.pass("MONITORING_SECRET configured");
reporter.finish(`M${version} production environment is configured`);
