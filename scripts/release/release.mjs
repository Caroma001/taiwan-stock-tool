import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { git, isGitRepo, pkg, readJson, releaseLabel, run, version, writeJson } from "./common.mjs";

const command = process.argv[2] || "show";

function show() {
  const state = readJson("version.json");
  console.log(JSON.stringify({ package: pkg.name, version, releaseLabel, state }, null, 2));
}

function checkGit() {
  if (!isGitRepo()) {
    console.warn("⚠️ Git repository not initialized. Build and deployment can still run manually.");
    return;
  }
  const status = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim();
  if (status) throw new Error("Git working tree is not clean. Commit or stash changes before publishing.");
  console.log("✅ Git working tree is clean.");
}

function prepare() {
  run("npm", ["run", "verify"]);
  const state = readJson("version.json");
  state.status = "Verified";
  state.verification = "Passed";
  state.build = "Passed";
  state.updatedAt = new Date().toISOString();
  writeJson("version.json", state);
  console.log(`✅ ${releaseLabel} prepared for deployment.`);
}

function publish() {
  checkGit();
  prepare();
  run("npm", ["run", "deploy", "--", "--skip-verify"]);
  if (isGitRepo()) {
    const tag = `v${version}`;
    const existing = execFileSync("git", ["tag", "--list", tag], { encoding: "utf8" }).trim();
    if (!existing) {
      git(["tag", "-a", tag, "-m", `${releaseLabel} release`]);
      console.log(`✅ Created Git tag ${tag}. Push it with: git push origin ${tag}`);
    } else console.log(`ℹ️ Git tag ${tag} already exists.`);
  }
}

if (command === "show") show();
else if (command === "check") { checkGit(); run("npm", ["run", "verify"]); }
else if (command === "prepare") prepare();
else if (command === "publish") publish();
else { console.error(`Unknown release command: ${command}`); process.exit(1); }
