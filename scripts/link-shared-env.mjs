import {
  existsSync,
  lstatSync,
  readlinkSync,
  renameSync,
  symlinkSync,
} from "node:fs";
import { resolve, relative } from "node:path";
import { homedir } from "node:os";

const projectRoot = process.cwd();
const sharedEnv = resolve(homedir(), "Projects", "GN.data", ".env.local");
const projectEnv = resolve(projectRoot, ".env.local");
const linkTarget = relative(projectRoot, sharedEnv);

if (!existsSync(sharedEnv)) {
  console.error("");
  console.error(`找不到共用環境檔：${sharedEnv}`);
  console.error("請先確認檔案已存在，再重新執行：");
  console.error("node scripts/link-shared-env.mjs");
  console.error("");
  process.exit(1);
}

if (existsSync(projectEnv)) {
  const stat = lstatSync(projectEnv);

  if (stat.isSymbolicLink()) {
    const currentTarget = readlinkSync(projectEnv);

    if (currentTarget === linkTarget) {
      console.log(`已正確引用：.env.local -> ${linkTarget}`);
      process.exit(0);
    }
  }

  const backupPath = `${projectEnv}.backup-${Date.now()}`;
  renameSync(projectEnv, backupPath);
  console.log(`原本的 .env.local 已備份：${backupPath}`);
}

symlinkSync(linkTarget, projectEnv);

console.log("");
console.log("共用環境設定完成：");
console.log(`專案：${projectRoot}`);
console.log(`引用：${sharedEnv}`);
console.log(`連結：.env.local -> ${linkTarget}`);
console.log("");
