import { rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const nextDir = path.join(root, ".next");

console.log("Bruce TWST-AI M8.10.1 - Stable Dev Server");
console.log("Cleaning stale .next cache before Next.js starts...");
await rm(nextDir, { recursive: true, force: true });

const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
if (!existsSync(nextBin)) {
  console.error("Next.js is not installed. Run `npm install` first.");
  process.exit(1);
}

const child = spawn(process.execPath, [nextBin, "dev", "--webpack"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

const forward = (signal) => {
  if (!child.killed) child.kill(signal);
};
process.on("SIGINT", () => forward("SIGINT"));
process.on("SIGTERM", () => forward("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
