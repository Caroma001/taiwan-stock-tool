import { existsSync, lstatSync, readlinkSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

const projectRoot = process.cwd();
const sharedEnv = resolve(homedir(), "Projects", "GN.data", ".env.local");
const projectEnv = resolve(projectRoot, ".env.local");

console.log(`共用環境檔：${sharedEnv}`);
console.log(`專案環境檔：${projectEnv}`);

if (!existsSync(sharedEnv)) {
  console.error("❌ 共用環境檔不存在");
  process.exit(1);
}

if (!existsSync(projectEnv)) {
  console.error("❌ 專案尚未建立 .env.local 符號連結");
  process.exit(1);
}

const stat = lstatSync(projectEnv);

if (!stat.isSymbolicLink()) {
  console.error("❌ 專案的 .env.local 不是符號連結");
  process.exit(1);
}

console.log(`✅ .env.local -> ${readlinkSync(projectEnv)}`);
