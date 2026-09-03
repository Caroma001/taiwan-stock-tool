import { requireFiles, run, version, releaseLabel } from "./common.mjs";

console.log(`\nBruce TWST-AI ${releaseLabel} — Local Verification`);
requireFiles([
  "package.json", "version.json", "vercel.json", "app/api/health/route.ts",
  "app/api/ready/route.ts", "docs/RELEASE.md", "docs/DEPLOYMENT.md",
  "docs/VERSION_HISTORY.md", "scripts/release/deploy.mjs",
]);

const state = JSON.parse(await (await import("node:fs/promises")).readFile("version.json", "utf8"));
if (state.version !== version) throw new Error(`version.json (${state.version}) does not match package.json (${version})`);

run("npm", ["run", "safety:check"]);
run("npm", ["run", "read-budget:check"]);
run("npm", ["run", "typecheck"]);
run("npm", ["run", "build"]);
console.log(`\n✅ ${releaseLabel} verification passed.`);
