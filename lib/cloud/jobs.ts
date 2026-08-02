import { randomUUID } from "node:crypto";
import { TursoDatabaseAdapter } from "@/adapters/turso";
import { getTursoClient } from "@/lib/turso";
import { MigrationRunner } from "@/migrations/database/MigrationRunner";
import { tursoMigrations } from "@/migrations/turso";
import { MarketPipeline } from "@/services/scoring";
import { refreshMarketData, refreshValidationSnapshots } from "@/lib/market/service";
import { analyzeHotStock } from "@/lib/hot-stocks/service";
import type { DatabaseRow } from "@/lib/database";

interface SymbolRow extends DatabaseRow { symbol: string; }
interface JobRow extends DatabaseRow {
  id:string; job_date:string; status:string; total_symbols:number; processed_symbols:number;
  success_symbols:number; failed_symbols:number; batch_size:number; current_symbol:string|null;
  last_error:string|null; started_at:string|null; updated_at:string; completed_at:string|null;
}

const todayTaipei = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year:"numeric",month:"2-digit",day:"2-digit" }).format(new Date());
const sleep = (ms:number) => new Promise(resolve => setTimeout(resolve, ms));

async function database() {
  const db = new TursoDatabaseAdapter(getTursoClient());
  await new MigrationRunner(db, tursoMigrations).migrate();
  return db;
}

export async function createOrResumeCloudJob(batchSize = 12) {
  const db = await database();
  const date = todayTaipei();
  const existing = await db.execute<JobRow>({ sql:"SELECT * FROM cloud_update_jobs WHERE job_date=? LIMIT 1", args:[date] });
  if (existing.rows[0]) return existing.rows[0];
  const symbols = await db.execute<SymbolRow>({ sql:"SELECT symbol FROM stocks WHERE is_active=1 ORDER BY symbol" });
  const id = randomUUID(); const now = new Date().toISOString();
  await db.transaction(async tx => {
    await tx.execute({ sql:"INSERT INTO cloud_update_jobs(id,job_date,status,total_symbols,batch_size,updated_at) VALUES(?,?,?,?,?,?)", args:[id,date,"waiting",symbols.rows.length,batchSize,now] });
    if (symbols.rows.length) await tx.executeMany(symbols.rows.map(r => ({ sql:"INSERT INTO cloud_update_items(job_id,symbol,status,updated_at) VALUES(?,?,?,?)", args:[id,r.symbol,"waiting",now] })));
  });
  return (await db.execute<JobRow>({ sql:"SELECT * FROM cloud_update_jobs WHERE id=?", args:[id] })).rows[0];
}

export async function processCloudBatch(jobId?: string) {
  const db = await database();
  const jobResult = jobId
    ? await db.execute<JobRow>({ sql:"SELECT * FROM cloud_update_jobs WHERE id=?", args:[jobId] })
    : await db.execute<JobRow>({ sql:"SELECT * FROM cloud_update_jobs WHERE status IN ('waiting','running') ORDER BY updated_at DESC LIMIT 1" });
  const job = jobResult.rows[0];
  if (!job) return { ok:true, status:"idle", message:"No pending cloud job.", batchProcessed:0, pending:0 };
  if (job.status === "completed") return { ok:true, status:"completed", jobId:job.id, batchProcessed:0, pending:0 };
  const now = new Date().toISOString();
  await db.execute({ sql:"UPDATE cloud_update_jobs SET status='running',started_at=COALESCE(started_at,?),updated_at=? WHERE id=?", args:[now,now,job.id] });
  const items = await db.execute<SymbolRow>({ sql:"SELECT symbol FROM cloud_update_items WHERE job_id=? AND status IN ('waiting','failed') AND attempts<4 ORDER BY symbol LIMIT ?", args:[job.id,Number(job.batch_size || 12)] });
  const pipeline = new MarketPipeline(db); let success=0, failed=0;
  for (const item of items.rows) {
    const symbol = item.symbol;
    await db.execute({ sql:"UPDATE cloud_update_items SET status='running',attempts=attempts+1,updated_at=? WHERE job_id=? AND symbol=?", args:[new Date().toISOString(),job.id,symbol] });
    try {
      await pipeline.runSingleSymbol(symbol,{refreshTop30:false}); success++;
      await db.execute({ sql:"UPDATE cloud_update_items SET status='completed',last_error=NULL,updated_at=? WHERE job_id=? AND symbol=?", args:[new Date().toISOString(),job.id,symbol] });
    } catch (error) {
      failed++;
      await db.execute({ sql:"UPDATE cloud_update_items SET status='failed',last_error=?,updated_at=? WHERE job_id=? AND symbol=?", args:[error instanceof Error?error.message.slice(0,900):String(error).slice(0,900),new Date().toISOString(),job.id,symbol] });
    }
    await db.execute({ sql:"UPDATE cloud_update_jobs SET current_symbol=?,updated_at=? WHERE id=?", args:[symbol,new Date().toISOString(),job.id] });
  }
  const counts = await db.execute<DatabaseRow>({ sql:"SELECT SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) done,SUM(CASE WHEN status='failed' AND attempts>=4 THEN 1 ELSE 0 END) failed,SUM(CASE WHEN status IN ('waiting','running') OR (status='failed' AND attempts<4) THEN 1 ELSE 0 END) pending FROM cloud_update_items WHERE job_id=?", args:[job.id] });
  const done=Number(counts.rows[0]?.done??0), failedTotal=Number(counts.rows[0]?.failed??0), pending=Number(counts.rows[0]?.pending??0);
  if (pending===0) {
    await pipeline.refreshTop30();
    await db.execute({ sql:"UPDATE cloud_update_jobs SET status='completed',processed_symbols=?,success_symbols=?,failed_symbols=?,completed_at=?,updated_at=? WHERE id=?", args:[done+failedTotal,done,failedTotal,new Date().toISOString(),new Date().toISOString(),job.id] });
  } else {
    await db.execute({ sql:"UPDATE cloud_update_jobs SET processed_symbols=?,success_symbols=?,failed_symbols=?,updated_at=? WHERE id=?", args:[done+failedTotal,done,failedTotal,new Date().toISOString(),job.id] });
  }
  return {ok:true,jobId:job.id,batchProcessed:items.rows.length,batchSuccess:success,batchFailed:failed,processed:done+failedTotal,success:done,failed:failedTotal,pending,status:pending===0?"completed":"running"};
}

async function refreshActiveHotStocks(deadline:number) {
  const db = await database();
  const result = await db.execute<SymbolRow>({ sql:"SELECT symbol FROM hot_stock_candidates WHERE is_active=1 ORDER BY updated_at ASC LIMIT 30" });
  let completed=0, failed=0;
  for (const row of result.rows) {
    if (Date.now() > deadline - 12000) break;
    try { await analyzeHotStock(row.symbol); completed++; } catch { failed++; }
  }
  return {completed, failed};
}

export async function runCloudSchedulerWindow(options?: { source?:string; maxDurationMs?:number; batchSize?:number }) {
  const source=options?.source ?? "manual";
  const maxDurationMs=Math.min(options?.maxDurationMs ?? 260000, 275000);
  const started=Date.now(), deadline=started+maxDurationMs;
  const db=await database();
  const runId=randomUUID();
  const now=new Date().toISOString();
  await db.execute({sql:"INSERT INTO cloud_scheduler_runs(id,trigger_source,status,started_at,heartbeat_at) VALUES(?,?,?,?,?)",args:[runId,source,"running",now,now]});
  let batches=0,symbols=0,marketRefreshed=0,validationRefreshed=0,hotStocksRefreshed=0;
  let job:JobRow|undefined;
  try {
    await refreshMarketData(); marketRefreshed=1;
    job=await createOrResumeCloudJob(options?.batchSize ?? 12);
    await db.execute({sql:"UPDATE cloud_scheduler_runs SET job_id=?,market_refreshed=1,heartbeat_at=? WHERE id=?",args:[job.id,new Date().toISOString(),runId]});
    while(Date.now()<deadline-18000){
      const result=await processCloudBatch(job.id);
      batches++; symbols+=Number(result.batchProcessed??0);
      await db.execute({sql:"UPDATE cloud_scheduler_runs SET heartbeat_at=?,elapsed_ms=?,batches_processed=?,symbols_processed=? WHERE id=?",args:[new Date().toISOString(),Date.now()-started,batches,symbols,runId]});
      if(result.status==="completed"||Number(result.pending??0)===0) break;
      if(Number(result.batchProcessed??0)===0) { await sleep(1000); break; }
    }
    const latest=await db.execute<JobRow>({sql:"SELECT * FROM cloud_update_jobs WHERE id=?",args:[job.id]});
    const completed=latest.rows[0]?.status==="completed";
    if(completed && Date.now()<deadline-12000){ await refreshValidationSnapshots(); validationRefreshed=1; }
    if(completed && Date.now()<deadline-12000){ const hot=await refreshActiveHotStocks(deadline); hotStocksRefreshed=hot.completed; }
    const status=completed?"completed":"checkpointed";
    await db.execute({sql:"UPDATE cloud_scheduler_runs SET status=?,heartbeat_at=?,completed_at=?,elapsed_ms=?,batches_processed=?,symbols_processed=?,validation_refreshed=?,hot_stocks_refreshed=? WHERE id=?",args:[status,new Date().toISOString(),new Date().toISOString(),Date.now()-started,batches,symbols,validationRefreshed,hotStocksRefreshed,runId]});
    return {ok:true,runId,status,jobId:job.id,batches,symbols,marketRefreshed:Boolean(marketRefreshed),validationRefreshed:Boolean(validationRefreshed),hotStocksRefreshed,elapsedMs:Date.now()-started,cloudJob:latest.rows[0]??job};
  } catch(error){
    const message=error instanceof Error?error.message:String(error);
    await db.execute({sql:"UPDATE cloud_scheduler_runs SET status='failed',heartbeat_at=?,completed_at=?,elapsed_ms=?,last_error=? WHERE id=?",args:[new Date().toISOString(),new Date().toISOString(),Date.now()-started,message.slice(0,900),runId]});
    throw error;
  }
}

export async function getCloudStatus() {
  const db = await database();
  const [jobResult,runResult]=await Promise.all([
    db.execute<JobRow>({ sql:"SELECT * FROM cloud_update_jobs ORDER BY updated_at DESC LIMIT 1" }),
    db.execute<DatabaseRow>({ sql:"SELECT * FROM cloud_scheduler_runs ORDER BY started_at DESC LIMIT 1" }),
  ]);
  const job=jobResult.rows[0];
  if(!job) return {ok:true,status:"not_started",lastSchedulerRun:runResult.rows[0]??null};
  const total=Number(job.total_symbols||0), processed=Number(job.processed_symbols||0);
  return {ok:true,...job,percentage:total?Math.round(processed/total*10000)/100:0,remaining:Math.max(0,total-processed),lastSchedulerRun:runResult.rows[0]??null};
}
