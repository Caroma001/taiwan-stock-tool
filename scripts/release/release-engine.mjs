import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import {
  appendSectionOnce,
  parseVersion,
  readJson,
  releasePaths,
  replaceManagedBlock,
  updatePackageFiles,
  writeIfChanged,
  writeJson,
} from "./release-utils.mjs";

const command = process.argv[2] ?? "show";
const requestedVersion = process.argv[3];
const pkg = readJson("package.json");
const current = parseVersion(pkg.version);

function versionState(version, status = "Preparing") {
  const parsed = parseVersion(version);
  return {
    schemaVersion: 1,
    version,
    release: parsed.fullLabel,
    majorRelease: parsed.majorLabel,
    minorRelease: parsed.minorLabel,
    status,
    verification: status === "Stable" ? "Passed" : "Pending",
    build: status === "Stable" ? "Passed" : "Pending",
    deployment: status === "Stable" ? "Ready" : "Pending",
    updatedAt: new Date().toISOString(),
  };
}

function currentMarkdown(state) {
  return `# Current Release

- Current Version: ${state.release}
- Status: ${state.status}
- Verification Pipeline: ${state.verification}
- Production Build: ${state.build}
- Deployment: ${state.deployment}

## Standard Release Flow

\`\`\`bash
npm run release:new -- <next-version>
npm run doctor
npm run verify
npm run build
npm run release:finish
\`\`\`
`;
}

function releaseTemplate(parsed) {
  return `# ${parsed.minorLabel} Release

## ${parsed.version}

Status: Preparing

### Overview

- Release created by the permanent Release Automation Framework.

### Features

- Add release features here.

### Migration

- No migration notes recorded yet.

### Verification

\`npm run doctor\`
\`npm run verify\`
\`npm run build\`

### Deployment

- GitHub push triggers Vercel Production deployment.

### Rollback

- Use the previous successful Vercel deployment if health checks fail.
`;
}

function majorSection(parsed) {
  return `## ${parsed.version}

- Release family: ${parsed.minorLabel}
- Release automation updates package metadata, version.json, CURRENT.md, release documentation, Doctor, and Verify through dynamic version discovery.
`;
}

function updateReadme(state) {
  if (!existsSync("README.md")) return false;
  return replaceManagedBlock(
    "README.md",
    "<!-- TWSTOCK_RELEASE_START -->",
    "<!-- TWSTOCK_RELEASE_END -->",
    `## Current Release

- Version: ${state.release}
- Status: ${state.status}
- Verify: \`npm run verify\`
- Build: \`npm run build\``,
  );
}

function prepareRelease(version) {
  const parsed = parseVersion(version);
  const paths = releasePaths(version);
  const state = versionState(version, "Preparing");

  updatePackageFiles(version);
  writeJson(paths.versionJson, state);
  writeIfChanged(paths.current, currentMarkdown(state));

  if (!existsSync(paths.minor)) writeIfChanged(paths.minor, releaseTemplate(parsed));
  appendSectionOnce(paths.major, `## ${parsed.version}`, majorSection(parsed));
  updateReadme(state);

  console.log(`✅ Release prepared: ${parsed.fullLabel}`);
  console.log(`✅ package.json and lock files updated`);
  console.log(`✅ ${paths.versionJson}`);
  console.log(`✅ ${paths.current}`);
  console.log(`✅ ${paths.major}`);
  console.log(`✅ ${paths.minor}`);
  console.log("✅ Doctor and Verify require no source edits; both read package.json/version.json dynamically.");
}

function finishRelease() {
  const pkgNow = readJson("package.json");
  const parsed = parseVersion(pkgNow.version);
  const paths = releasePaths(parsed.version);
  const state = versionState(parsed.version, "Stable");
  writeJson(paths.versionJson, state);
  writeIfChanged(paths.current, currentMarkdown(state));
  updateReadme(state);

  if (existsSync(paths.minor)) {
    const text = readFileSync(paths.minor, "utf8")
      .replace(`## ${parsed.version}\n\nStatus: Preparing`, `## ${parsed.version}\n\nStatus: Stable`);
    writeIfChanged(paths.minor, text);
  }
  console.log(`✅ ${parsed.fullLabel} marked Stable.`);
}

function show() {
  const state = existsSync("version.json") ? readJson("version.json") : versionState(current.version, "Unknown");
  console.log(JSON.stringify({ packageVersion: current.version, ...state, paths: releasePaths(current.version) }, null, 2));
}

if (command === "show") show();
else if (command === "new" || command === "prepare") {
  if (!requestedVersion) {
    console.error("❌ Missing version. Example: npm run release:new -- 7.8.0");
    process.exit(1);
  }
  prepareRelease(requestedVersion);
} else if (command === "finish") finishRelease();
else {
  console.error(`❌ Unknown release command: ${command}`);
  process.exit(1);
}
