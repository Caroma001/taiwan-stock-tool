import { cpSync, existsSync, mkdirSync } from "node:fs";

const runtimeDir = ".runtime/pipeline";
if (!existsSync(runtimeDir)) throw new Error(`Missing ${runtimeDir}`);
mkdirSync(`${runtimeDir}/node_modules/@`, { recursive: true });
for (const dir of ["adapters", "lib", "migrations", "providers", "services"]) {
  const source = `${runtimeDir}/${dir}`;
  if (existsSync(source)) cpSync(source, `${runtimeDir}/node_modules/@/${dir}`, { recursive: true });
}
