import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync, execFileSync } from "node:child_process";
import path from "node:path";

export const root = process.cwd();
export const pkg = JSON.parse(readFileSync("package.json", "utf8"));
export const version = pkg.version;
export const releaseLabel = `M${version}`;

export function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function logFile(prefix) {
  mkdirSync("logs/release", { recursive: true });
  return path.join("logs/release", `${prefix}-${timestamp()}.log`);
}

export function run(command, args = [], options = {}) {
  const pretty = `${command} ${args.join(" ")}`.trim();
  console.log(`\n▶ ${pretty}`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: options.capture ? "utf8" : undefined,
    shell: process.platform === "win32",
    env: { ...process.env, ...options.env },
  });
  if (options.capture) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${pretty} failed with exit code ${result.status ?? "unknown"}`);
  }
  return result;
}

export function hasCommand(command) {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", [command], { stdio: "ignore" });
    return true;
  } catch { return false; }
}

export function git(args, options = {}) {
  return run("git", args, options);
}

export function isGitRepo() {
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { stdio: "ignore" });
    return true;
  } catch { return false; }
}

export function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

export function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function requireFiles(files) {
  const missing = files.filter((file) => !existsSync(file));
  if (missing.length) throw new Error(`Missing required files:\n- ${missing.join("\n- ")}`);
}

export function resolveProductionUrl() {
  const raw = process.env.TWSTOCK_PRODUCTION_URL || process.env.PRODUCTION_URL || "";
  return raw.trim().replace(/\/$/, "");
}
