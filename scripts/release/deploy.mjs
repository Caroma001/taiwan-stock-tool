import { existsSync, readFileSync } from "node:fs";
import { run, releaseLabel } from "./common.mjs";

const preview = process.argv.includes("--preview");
const skipVerify = process.argv.includes("--skip-verify");
if (!skipVerify) run("npm", ["run", "verify"]);

if (!existsSync(".vercel/project.json")) {
  console.error("❌ This folder is not linked to Vercel.");
  console.error("Run once: npx vercel link");
  process.exit(1);
}

const project = JSON.parse(readFileSync(".vercel/project.json", "utf8"));
console.log(`\nDeploying ${releaseLabel} to Vercel project ${project.projectId}`);
const args = ["vercel"];
if (!preview) args.push("--prod");
run("npx", args);
console.log(`\n✅ ${preview ? "Preview" : "Production"} deployment command completed.`);
