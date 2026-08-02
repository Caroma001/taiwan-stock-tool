import { readFileSync, existsSync } from "node:fs";
import { TursoDatabaseAdapter } from "@/adapters/turso";
import { getTursoClient } from "@/lib/turso";
import { MigrationRunner } from "@/migrations/database/MigrationRunner";
import { tursoMigrations } from "@/migrations/turso";
import { MarketPipeline } from "@/services/scoring";
import type { DatabaseRow } from "@/lib/database";

function loadEnv(path = ".env.local") { if (!existsSync(path)) return; for (const raw of readFileSync(path,"utf8").split(/\r?\n/)) { const m=raw.trim().match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/); if (!m) continue; let v=m[2].trim(); if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1); if (!process.env[m[1]]) process.env[m[1]]=v; } }
interface RunRow extends DatabaseRow { id:string; status:string; stage:string; total_symbols:number; processed_symbols:number; success_symbols:number; failed_symbols:number; current_symbol:string|null; started_at:string; updated_at:string; completed_at:string|null; error:string|null; }
async function main() { loadEnv(); const db=new TursoDatabaseAdapter(getTursoClient()); const command=process.argv[2] ?? "status"; try {
  if (command === "migrate") { const status=await new MigrationRunner(db,tursoMigrations).migrate(); console.log(JSON.stringify(status,null,2)); return; }
  await new MigrationRunner(db,tursoMigrations).migrate(); const pipeline=new MarketPipeline(db);
  if (command === "dry-run") console.log(JSON.stringify(await pipeline.dryRun(),null,2));
  else if (command === "test-3") console.log(JSON.stringify(await pipeline.run({symbols:["2330","3491","6182"],historyDays:760,rateLimitMs:1100}),null,2));
  else if (command === "run") console.log(JSON.stringify(await pipeline.run({historyDays:760,rateLimitMs:1100}),null,2));
  else if (command === "top30") console.log(JSON.stringify(await pipeline.refreshTop30(),null,2));
  else if (command === "status") { const result=await db.execute<RunRow>({sql:"SELECT * FROM market_pipeline_runs ORDER BY started_at DESC LIMIT 1"}); console.log(JSON.stringify(result.rows[0] ?? {status:"not_started"},null,2)); }
  else throw new Error(`Unknown command: ${command}`);
} finally { await db.close(); } }
main().catch(error => { console.error(error instanceof Error ? error.stack : error); process.exitCode=1; });
