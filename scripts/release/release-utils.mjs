import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

export function parseVersion(version) {
  const match = SEMVER_PATTERN.exec(version ?? "");
  if (!match) throw new Error(`Invalid semantic version: ${version ?? "missing"}`);
  const [, major, minor, patch] = match;
  return {
    version,
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    majorLabel: `M${major}`,
    minorLabel: `M${major}.${minor}`,
    fullLabel: `M${version}`,
  };
}

export function readJson(file) {
  if (!existsSync(file)) throw new Error(`${file} not found`);
  return JSON.parse(readFileSync(file, "utf8"));
}

export function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function updatePackageFiles(version) {
  for (const file of ["package.json", "package-lock.json", "npm-shrinkwrap.json"]) {
    if (!existsSync(file)) continue;
    const data = readJson(file);
    data.version = version;
    if (data.packages?.[""]) data.packages[""].version = version;
    writeJson(file, data);
  }
}

export function releasePaths(version) {
  const parsed = parseVersion(version);
  return {
    releaseDir: "docs/release",
    current: "docs/release/CURRENT.md",
    major: `docs/release/${parsed.majorLabel}_RELEASE.md`,
    minor: `docs/release/${parsed.minorLabel}_RELEASE.md`,
    versionJson: "version.json",
  };
}

export function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

export function writeIfChanged(file, content) {
  ensureDir(path.dirname(file));
  const normalized = content.endsWith("\n") ? content : `${content}\n`;
  if (existsSync(file) && readFileSync(file, "utf8") === normalized) return false;
  writeFileSync(file, normalized, "utf8");
  return true;
}

export function appendSectionOnce(file, heading, section) {
  ensureDir(path.dirname(file));
  const current = existsSync(file) ? readFileSync(file, "utf8") : "";
  if (current.includes(heading)) return false;
  const separator = current.trim() ? "\n\n---\n\n" : "";
  writeFileSync(file, `${current.trimEnd()}${separator}${section.trim()}\n`, "utf8");
  return true;
}

export function replaceManagedBlock(file, startMarker, endMarker, content) {
  const current = existsSync(file) ? readFileSync(file, "utf8") : "";
  const block = `${startMarker}\n${content.trim()}\n${endMarker}`;
  let next;
  const start = current.indexOf(startMarker);
  const end = current.indexOf(endMarker);
  if (start >= 0 && end > start) {
    next = `${current.slice(0, start)}${block}${current.slice(end + endMarker.length)}`;
  } else {
    next = `${current.trimEnd()}${current.trim() ? "\n\n" : ""}${block}\n`;
  }
  return writeIfChanged(file, next);
}
