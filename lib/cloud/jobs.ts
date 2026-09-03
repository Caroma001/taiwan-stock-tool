import { randomUUID } from "node:crypto";
import { TursoDatabaseAdapter } from "@/adapters/turso";
import { getTursoClient } from "@/lib/turso";
import { MigrationRunner } from "@/migrations/database/MigrationRunner";
import { tursoMigrations } from "@/migrations/turso";
import { MarketPipeline } from "@/services/scoring";
import { refreshMarketData } from "@/lib/market/service";
import { analyzeHotStock } from "@/lib/hot-stocks/service";
import type { DatabaseRow, DatabaseStatement } from "@/lib/database";
import { classifyDailyUniverseStock } from "@/lib/development/market-universe";
import { resolveActiveDevelopmentJob } from "@/lib/cloud/active-job";
import { ensureDailyBulkSnapshot } from "@/lib/development/bulk-daily-engine";

interface SymbolRow extends DatabaseRow {
  symbol: string;
  name: string | null;
  market: string | null;
  industry: string | null;
  is_active: number | null;
}
interface QueueItemRow extends DatabaseRow { symbol: string; attempts: number; }
interface JobRow extends DatabaseRow {
  id:string; job_date:string; status:string; total_symbols:number; processed_symbols:number;
  success_symbols:number; failed_symbols:number; skipped_symbols:number|null; batch_size:number; current_symbol:string|null;
  last_error:string|null; started_at:string|null; updated_at:string; completed_at:string|null;
}

const todayTaipei = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year:"numeric",month:"2-digit",day:"2-digit" }).format(new Date());
const sleep = (ms:number) => new Promise(resolve => setTimeout(resolve, ms));

async function database(options: { migrate?: boolean } = {}) {
  const db = new TursoDatabaseAdapter(getTursoClient());
  if (options.migrate !== false) {
    await new MigrationRunner(db, tursoMigrations).migrate();
  }
  return db;
}

async function executeStatusQueryWithRetry<T extends DatabaseRow>(
  db: TursoDatabaseAdapter,
  query: DatabaseStatement,
  attempts = 2,
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await db.execute<T>(query);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(350 * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "Turso query failed"));
}

export async function createOrResumeCloudJob(batchSize = 12) {
  const db = await database();
  const date = todayTaipei();
  const existing = await db.execute<JobRow>({ sql:"SELECT * FROM cloud_update_jobs WHERE job_date=? LIMIT 1", args:[date] });
  if (existing.rows[0]) return existing.rows[0];
  const symbols = await db.execute<SymbolRow>({ sql:"SELECT symbol,name,market,industry,is_active FROM stocks WHERE is_active=1 ORDER BY symbol" });
  const universe = symbols.rows.map((row) => ({ row, decision: classifyDailyUniverseStock(row) }));
  const eligible = universe.filter((item) => item.decision.eligible);
  const skipped = universe.filter((item) => !item.decision.eligible);
  const id = randomUUID(); const now = new Date().toISOString();
  await db.transaction(async tx => {
    await tx.execute({ sql:"INSERT INTO cloud_update_jobs(id,job_date,status,total_symbols,processed_symbols,success_symbols,failed_symbols,skipped_symbols,batch_size,updated_at) VALUES(?,?,?,?,?,0,0,?,?,?)", args:[id,date,"waiting",symbols.rows.length,skipped.length,skipped.length,batchSize,now] });
    if (eligible.length) await tx.executeMany(eligible.map(({row}) => ({ sql:"INSERT INTO cloud_update_items(job_id,symbol,status,attempts,next_attempt_at,updated_at) VALUES(?,?,?,0,NULL,?)", args:[id,row.symbol,"waiting",now] })));
    if (skipped.length) await tx.executeMany(skipped.map(({row,decision}) => ({ sql:"INSERT INTO cloud_update_items(job_id,symbol,status,attempts,last_error,next_attempt_at,updated_at) VALUES(?,?,?,0,?,NULL,?)", args:[id,row.symbol,"skipped",decision.reason ?? "市場清單略過：非普通股商品",now] })));
  });
  return (await db.execute<JobRow>({ sql:"SELECT * FROM cloud_update_jobs WHERE id=?", args:[id] })).rows[0];
}

export async function processCloudBatch(
  jobId?: string,
  options: { heartbeat?: (phase: string, processed?: number) => Promise<void> } = {},
) {
  // M8.10.9: this worker no longer re-aggregates every cloud_update_items row
  // after each 12-symbol batch. Turso bills aggregate scans per row considered,
  // so job counters are maintained incrementally as each item reaches a terminal
  // state. The hot path now reads one job row + one small queue slice.
  // Apply pending schema migrations once per Queue slice so an in-flight job from
  // M8.10.8 can immediately gain the M8.10.9 checkpoint/index tables after the
  // Turso quota is restored. MigrationRunner itself is now read-light.
  const db = await database();
  let resolvedJobId = String(jobId ?? "").trim();
  if (!resolvedJobId) {
    const active = await resolveActiveDevelopmentJob(db, null, { repair: true });
    resolvedJobId = String(active.jobId ?? "");
  }
  const jobResult = resolvedJobId
    ? await db.execute<JobRow>({ sql:"SELECT * FROM cloud_update_jobs WHERE id=? LIMIT 1", args:[resolvedJobId] })
    : { rows: [] as readonly JobRow[], rowsAffected: 0 };
  const job = jobResult.rows[0];
  if (!job) return { ok:true, status:"idle", message:"No pending cloud job.", batchProcessed:0, pending:0 };
  if (job.status === "completed") return { ok:true, status:"completed", jobId:job.id, batchProcessed:0, pending:0 };

  // M8.10.20 — network I/O is market-wide, never symbol-wide.
  // The first Queue slice fetches one complete daily price + institutional
  // snapshot. Every subsequent slice sees the one-row completed checkpoint and
  // performs analysis only. This turns thousands of upstream requests into ~4
  // official market requests (or 2 FinMind bulk requests when explicitly used).
  const targetTradeDate = String(job.job_date ?? "").match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? todayTaipei();
  await options.heartbeat?.("Queue Consumer：進入 Bulk Snapshot", Number(job.processed_symbols ?? 0));
  const bulkSnapshot = await ensureDailyBulkSnapshot(db, targetTradeDate, {
    heartbeat: async (phase) => {
      await options.heartbeat?.(phase, Number(job.processed_symbols ?? 0));
    },
  });
  await options.heartbeat?.(
    bulkSnapshot.ready ? "Bulk Snapshot：READY，開始本地分析" : "Bulk Snapshot：尚未 READY",
    Number(job.processed_symbols ?? 0),
  );
  if (!bulkSnapshot.ready) {
    return {
      ok:true,jobId:job.id,status:"running",batchProcessed:0,
      processed:Number(job.processed_symbols??0),pending:Math.max(0,Number(job.total_symbols??0)-Number(job.processed_symbols??0)),
      nextRetryAt: bulkSnapshot.nextRetryAt ?? null,
      rateLimited: Boolean(bulkSnapshot.nextRetryAt && /402|429|quota|rate.?limit|額度/i.test(String(bulkSnapshot.lastError ?? ""))),
      bulkSnapshot,
    };
  }

  const now = new Date().toISOString();
  await db.execute({
    sql:"UPDATE cloud_update_jobs SET status='running',started_at=COALESCE(started_at,?),updated_at=? WHERE id=?",
    args:[now,now,job.id],
  });

  // Recover only genuinely stale claims. Resetting every running item at the
  // start of each Queue slice can race with another consumer and duplicate work.
  const staleRunningBefore = new Date(Date.now() - 15 * 60_000).toISOString();
  await db.execute({
    sql:"UPDATE cloud_update_items SET status='waiting',next_attempt_at=NULL,updated_at=? WHERE job_id=? AND status='running' AND updated_at<?",
    args:[now,job.id,staleRunningBefore],
  });

  // A future rate-limit retry pauses the whole upstream feed. Do not aggregate
  // the queue; the already-persisted job counters are the source of truth.
  const cooldownRows = await db.execute<CloudItemDiagnosticRow>({
    sql:`SELECT symbol,status,attempts,last_error,next_attempt_at,updated_at
      FROM cloud_update_items
      WHERE job_id=? AND status='failed' AND attempts<4
        AND next_attempt_at IS NOT NULL AND next_attempt_at>?
      ORDER BY next_attempt_at LIMIT 12`,
    args:[job.id,new Date().toISOString()],
  });
  const quotaCooldown = cooldownRows.rows.find(
    (row) => classifyCloudUpdateError(row.last_error).category === "rate_limit",
  );
  if (quotaCooldown) {
    const fresh = (await db.execute<JobRow>({ sql:"SELECT * FROM cloud_update_jobs WHERE id=? LIMIT 1", args:[job.id] })).rows[0] ?? job;
    const processed = Number(fresh.processed_symbols ?? 0);
    const total = Number(fresh.total_symbols ?? 0);
    return {
      ok:true,jobId:job.id,batchProcessed:0,batchSuccess:0,batchFailed:0,
      processed,success:Number(fresh.success_symbols??0),skipped:Number(fresh.skipped_symbols??0),failed:Number(fresh.failed_symbols??0),
      pending:Math.max(0,total-processed),nextRetryAt:String(quotaCooldown.next_attempt_at??""),rateLimited:true,status:"running",
    };
  }

  const items = await db.execute<QueueItemRow>({
    sql:`SELECT cui.symbol,cui.attempts FROM cloud_update_items cui
      WHERE cui.job_id=? AND cui.status IN ('waiting','failed') AND cui.attempts<4
        AND (cui.next_attempt_at IS NULL OR cui.next_attempt_at<=?)
      ORDER BY CASE WHEN cui.symbol IN (
        SELECT symbol FROM portfolio_lots WHERE user_name='bruce' AND status='open' AND remaining_lots>0
        UNION SELECT symbol FROM watchlist WHERE user_name='bruce'
        UNION SELECT symbol FROM hot_stock_candidates WHERE is_active=1
      ) THEN 0 ELSE 1 END, cui.symbol LIMIT ?`,
    args:[job.id,new Date().toISOString(),Math.min(40,Math.max(24,Number(job.batch_size||12)))],
  });

  const pipeline = new MarketPipeline(db);
  let success=0, failed=0, skipped=0, attempted=0, terminalFailed=0, rateLimited=false;
  let nextRetryAt:string|null=null;

  for (const item of items.rows) {
    const symbol=String(item.symbol);
    const previousAttempts=Number(item.attempts??0);
    const attemptNumber=previousAttempts+1;
    const claim=await db.execute({
      sql:"UPDATE cloud_update_items SET status='running',attempts=attempts+1,updated_at=? WHERE job_id=? AND symbol=? AND status IN ('waiting','failed') AND attempts=?",
      args:[new Date().toISOString(),job.id,symbol,previousAttempts],
    });
    // Another queue invocation already claimed this symbol.
    if (claim.rowsAffected===0) continue;
    attempted+=1;

    try {
      await pipeline.runSingleSymbol(symbol,{refreshTop30:false,targetTradeDate,bulkSnapshotReady:true});
      await db.transaction(async tx=>{
        const done=await tx.execute({
          sql:"UPDATE cloud_update_items SET status='completed',last_error=NULL,next_attempt_at=NULL,updated_at=? WHERE job_id=? AND symbol=? AND status='running'",
          args:[new Date().toISOString(),job.id,symbol],
        });
        if (done.rowsAffected>0) {
          await tx.execute({
            sql:"UPDATE cloud_update_jobs SET processed_symbols=processed_symbols+1,success_symbols=success_symbols+1,current_symbol=?,updated_at=? WHERE id=?",
            args:[symbol,new Date().toISOString(),job.id],
          });
        }
      });
      success+=1;
    } catch (error) {
      const message=error instanceof Error?error.message.slice(0,900):String(error).slice(0,900);
      const classification=classifyCloudUpdateError(message);
      if (classification.expectedSkip) {
        await db.transaction(async tx=>{
          const done=await tx.execute({
            sql:"UPDATE cloud_update_items SET status='skipped',last_error=?,next_attempt_at=NULL,updated_at=? WHERE job_id=? AND symbol=? AND status='running'",
            args:[message,new Date().toISOString(),job.id,symbol],
          });
          if (done.rowsAffected>0) {
            await tx.execute({
              sql:"UPDATE cloud_update_jobs SET processed_symbols=processed_symbols+1,skipped_symbols=skipped_symbols+1,current_symbol=?,updated_at=? WHERE id=?",
              args:[symbol,new Date().toISOString(),job.id],
            });
          }
        });
        skipped+=1;
      } else {
        failed+=1;
        const retryAt=classification.category==="rate_limit"
          ? new Date(Date.now()+60*60_000).toISOString()
          : classification.category==="timeout"||classification.category==="network"
            ? new Date(Date.now()+5*60_000).toISOString()
            : null;
        nextRetryAt=retryAt??nextRetryAt;
        const isTerminal=attemptNumber>=4 && classification.category!=="rate_limit";
        await db.transaction(async tx=>{
          const persistedAttempts=classification.category==="rate_limit" ? previousAttempts : attemptNumber;
          const done=await tx.execute({
            // M8.10.24: 402/429 cooldown must NOT consume the permanent retry
            // budget. M8.10.22 could strand an item at attempts=4 forever:
            // attempts<4 would never select it again, while rate_limit was also
            // deliberately non-terminal. Restore the pre-claim attempt count.
            sql:"UPDATE cloud_update_items SET status='failed',attempts=?,last_error=?,next_attempt_at=?,updated_at=? WHERE job_id=? AND symbol=? AND status='running'",
            args:[persistedAttempts,message,retryAt,new Date().toISOString(),job.id,symbol],
          });
          if (done.rowsAffected>0) {
            await tx.execute({
              sql:isTerminal
                ? "UPDATE cloud_update_jobs SET processed_symbols=processed_symbols+1,failed_symbols=failed_symbols+1,current_symbol=?,updated_at=? WHERE id=?"
                : "UPDATE cloud_update_jobs SET current_symbol=?,updated_at=? WHERE id=?",
              args:[symbol,new Date().toISOString(),job.id],
            });
          }
        });
        if (isTerminal) terminalFailed+=1;
        if (classification.category==="rate_limit") rateLimited=true;
      }
    }

    if (attempted > 0 && attempted % 5 === 0) {
      await options.heartbeat?.(`本地分析：本批已處理 ${attempted} 檔`, Number(job.processed_symbols ?? 0) + success + skipped + terminalFailed);
    }
    if (rateLimited) break;
  }

  await options.heartbeat?.("本批分析完成，寫入 checkpoint", Number(job.processed_symbols ?? 0) + success + skipped + terminalFailed);

  const fresh=(await db.execute<JobRow>({ sql:"SELECT * FROM cloud_update_jobs WHERE id=? LIMIT 1", args:[job.id] })).rows[0]??job;
  const total=Number(fresh.total_symbols??0);
  const processedTotal=Number(fresh.processed_symbols??0);
  const pending=Math.max(0,total-processedTotal);

  // If the current slice was empty because every retry is cooling down, fetch
  // only the earliest retry row using the queue index. No COUNT/SUM scan.
  if (!nextRetryAt && pending>0 && attempted===0) {
    const retry=(await db.execute<DatabaseRow>({
      sql:"SELECT next_attempt_at FROM cloud_update_items WHERE job_id=? AND status='failed' AND attempts<4 AND next_attempt_at IS NOT NULL ORDER BY next_attempt_at LIMIT 1",
      args:[job.id],
    })).rows[0];
    nextRetryAt=retry?.next_attempt_at==null?null:String(retry.next_attempt_at);
  }

  if (pending===0) {
    await pipeline.refreshTop30();
    const completedAt=new Date().toISOString();
    await db.execute({
      sql:"UPDATE cloud_update_jobs SET status='completed',completed_at=?,updated_at=? WHERE id=?",
      args:[completedAt,completedAt,job.id],
    });
  }

  return {
    ok:true,jobId:job.id,batchProcessed:attempted,batchSuccess:success,batchFailed:failed,batchSkipped:skipped,
    batchTerminalFailed:terminalFailed,processed:processedTotal,success:Number(fresh.success_symbols??0),
    skipped:Number(fresh.skipped_symbols??0),failed:Number(fresh.failed_symbols??0),pending,nextRetryAt,rateLimited,
    status:pending===0?"completed":"running",bulkSnapshot,
  };
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
  let batches=0,symbols=0,marketRefreshed=0,hotStocksRefreshed=0;
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
    if(completed && Date.now()<deadline-12000){ const hot=await refreshActiveHotStocks(deadline); hotStocksRefreshed=hot.completed; }
    const status=completed?"completed":"checkpointed";
    await db.execute({sql:"UPDATE cloud_scheduler_runs SET status=?,heartbeat_at=?,completed_at=?,elapsed_ms=?,batches_processed=?,symbols_processed=?,validation_refreshed=0,hot_stocks_refreshed=? WHERE id=?",args:[status,new Date().toISOString(),new Date().toISOString(),Date.now()-started,batches,symbols,hotStocksRefreshed,runId]});
    return {ok:true,runId,status,jobId:job.id,batches,symbols,marketRefreshed:Boolean(marketRefreshed),hotStocksRefreshed,elapsedMs:Date.now()-started,cloudJob:latest.rows[0]??job};
  } catch(error){
    const message=error instanceof Error?error.message:String(error);
    await db.execute({sql:"UPDATE cloud_scheduler_runs SET status='failed',heartbeat_at=?,completed_at=?,elapsed_ms=?,last_error=? WHERE id=?",args:[new Date().toISOString(),new Date().toISOString(),Date.now()-started,message.slice(0,900),runId]});
    throw error;
  }
}



export type CloudUpdateErrorCategory =
  | "invalid_symbol"
  | "rate_limit"
  | "timeout"
  | "network"
  | "finmind"
  | "turso"
  | "source_no_data"
  | "other";

export type CloudUpdateErrorClassification = {
  category: CloudUpdateErrorCategory;
  label: string;
  expectedSkip: boolean;
};

export function classifyCloudUpdateError(raw: unknown): CloudUpdateErrorClassification {
  const message = String(raw ?? "").trim();
  if (/股票代號格式不正確|找不到(?:有效)?股票代號|目前不是有效上市櫃股票|非一般上市櫃股票|非普通股商品|市場清單略過/i.test(message)) {
    return { category: "invalid_symbol", label: "非普通股／不適用商品", expectedSkip: true };
  }
  if (/\b429\b|rate.?limit|quota|\b402\b|payment|required/i.test(message)) {
    return { category: "rate_limit", label: "API 額度／限速", expectedSkip: false };
  }
  if (/timeout|timed out|AbortError|ETIMEDOUT/i.test(message)) {
    return { category: "timeout", label: "連線逾時", expectedSkip: false };
  }
  if (/fetch failed|network|ECONN|ENOTFOUND|EAI_AGAIN|socket hang up/i.test(message)) {
    return { category: "network", label: "網路連線", expectedSkip: false };
  }
  if (/Turso|libsql|SQLITE|SQL_INPUT|SQL_/i.test(message)) {
    return { category: "turso", label: "Turso／SQL", expectedSkip: false };
  }
  if (/未回傳|沒有有效行情|資料不足|尚無.*資料|找不到指定股票|回傳資料中找不到|查無資料|no data/i.test(message)) {
    return { category: "source_no_data", label: "資料源無資料／不適用", expectedSkip: true };
  }
  if (/FinMind/i.test(message)) {
    return { category: "finmind", label: "FinMind 資料源", expectedSkip: false };
  }
  return { category: "other", label: "其他", expectedSkip: false };
}

type CloudItemDiagnosticRow = DatabaseRow & {
  symbol: string;
  status: string;
  attempts: number;
  last_error: string | null;
  next_attempt_at: string | null;
  updated_at: string;
};

async function normalizeExpectedSkippedItems(db: TursoDatabaseAdapter, jobId: string) {
  const rows = await db.execute<
    CloudItemDiagnosticRow & {
      name: string | null;
      market: string | null;
      industry: string | null;
      is_active: number | null;
    }
  >({
    sql: `SELECT cui.symbol,cui.status,cui.attempts,cui.last_error,cui.updated_at,s.name,s.market,s.industry,s.is_active
      FROM cloud_update_items cui LEFT JOIN stocks s ON s.symbol=cui.symbol
      WHERE cui.job_id=? AND cui.status='failed' AND cui.attempts>=4`,
    args: [jobId],
  });
  const skipped = rows.rows.filter((row) =>
    !classifyDailyUniverseStock(row).eligible || classifyCloudUpdateError(row.last_error).expectedSkip
  );
  if (skipped.length) {
    await db.executeMany(skipped.map((row) => ({
      sql: "UPDATE cloud_update_items SET status='skipped',next_attempt_at=NULL,last_error=COALESCE(last_error,'市場清單略過：非普通股／資料源不適用'),updated_at=? WHERE job_id=? AND symbol=?",
      args: [new Date().toISOString(), jobId, String(row.symbol)],
    })));
  }
  return skipped.length;
}

export async function getCloudUpdateDiagnostics(jobId?: string | null, limit = 20) {
  // M8.10.9 diagnostics is explicitly on-demand. Core success/skipped/failed
  // totals come from cloud_update_jobs; only bounded non-success rows are read.
  const db = await database({ migrate: false });
  let resolvedJobId = String(jobId ?? "").trim();
  let job: JobRow | undefined;
  if (!resolvedJobId) {
    const active = await resolveActiveDevelopmentJob(db, null, { repair: true });
    resolvedJobId = String(active.jobId ?? "");
    job = active.job as JobRow | undefined;
  } else {
    job = (await db.execute<JobRow>({ sql:"SELECT * FROM cloud_update_jobs WHERE id=? LIMIT 1", args:[resolvedJobId] })).rows[0];
  }
  if (!resolvedJobId || !job) {
    return { ok:true,jobId:null,status:"not_started",counts:{total:0,completed:0,skipped:0,trueFailed:0,retrying:0,coolingDown:0,pending:0,nextRetryAt:null},categories:[],recentFailures:[],lastActivityAt:null };
  }

  const boundedLimit=Math.max(5,Math.min(100,limit));
  const [retryRows,errorRows]=await Promise.all([
    db.execute<CloudItemDiagnosticRow>({
      sql:`SELECT symbol,status,attempts,last_error,next_attempt_at,updated_at
        FROM cloud_update_items
        WHERE job_id=? AND status='failed' AND attempts<4
        ORDER BY updated_at DESC LIMIT 100`,
      args:[resolvedJobId],
    }),
    db.execute<CloudItemDiagnosticRow>({
      sql:`SELECT symbol,status,attempts,last_error,next_attempt_at,updated_at
        FROM cloud_update_items
        WHERE job_id=? AND last_error IS NOT NULL AND status IN ('failed','skipped')
        ORDER BY updated_at DESC LIMIT ?`,
      args:[resolvedJobId,Math.max(100,boundedLimit)],
    }),
  ]);

  const now=Date.now();
  const cooling=retryRows.rows.filter(row=>{
    if (!row.next_attempt_at) return false;
    const t=new Date(String(row.next_attempt_at)).getTime();
    return Number.isFinite(t)&&t>now;
  });
  const nextRetryAt=cooling
    .map(row=>String(row.next_attempt_at))
    .sort()[0]??null;

  const categoryMap=new Map<string,{category:string;label:string;count:number;expectedSkip:boolean}>();
  for(const row of errorRows.rows){
    const cls=classifyCloudUpdateError(row.last_error);
    const current=categoryMap.get(cls.category)??{category:cls.category,label:cls.label,count:0,expectedSkip:cls.expectedSkip};
    current.count+=1;
    categoryMap.set(cls.category,current);
  }

  const recentFailures=errorRows.rows.slice(0,boundedLimit).map(row=>{
    const cls=classifyCloudUpdateError(row.last_error);
    return {
      symbol:String(row.symbol),status:String(row.status),attempts:Number(row.attempts??0),
      category:cls.category,categoryLabel:cls.label,expectedSkip:cls.expectedSkip,
      error:String(row.last_error??""),nextAttemptAt:row.next_attempt_at==null?null:String(row.next_attempt_at),
      updatedAt:String(row.updated_at??""),
    };
  });

  const total=Number(job.total_symbols??0);
  const completed=Number(job.success_symbols??0);
  const skipped=Number(job.skipped_symbols??0);
  const trueFailed=Number(job.failed_symbols??0);
  const processed=Number(job.processed_symbols??0);
  return {
    ok:true,jobId:resolvedJobId,status:String(job.status??"unknown"),
    currentSymbol:job.current_symbol==null?null:String(job.current_symbol),
    startedAt:job.started_at==null?null:String(job.started_at),updatedAt:String(job.updated_at??""),
    completedAt:job.completed_at==null?null:String(job.completed_at),lastActivityAt:String(job.updated_at??""),
    counts:{
      total,completed,skipped,trueFailed,retrying:retryRows.rows.length,coolingDown:cooling.length,
      pending:Math.max(0,total-processed),nextRetryAt,
    },
    categories:[...categoryMap.values()].sort((a,b)=>b.count-a.count),
    categoriesScope:"recent_non_success_100",
    recentFailures,
  };
}
export async function retryTerminalCloudFailures(jobId?: string | null) {
  const db = await database({ migrate: false });
  let resolvedJobId=String(jobId??"").trim();
  let job:JobRow|undefined;
  if(!resolvedJobId){
    const active=await resolveActiveDevelopmentJob(db, null, { repair:true });
    resolvedJobId=String(active.jobId??"");
    job=active.job as JobRow|undefined;
  } else {
    job=(await db.execute<JobRow>({sql:"SELECT * FROM cloud_update_jobs WHERE id=? LIMIT 1",args:[resolvedJobId]})).rows[0];
  }
  if(!resolvedJobId||!job) return {ok:true,jobId:null,retried:0,skipped:0};

  const rows=await db.execute<CloudItemDiagnosticRow>({
    sql:"SELECT symbol,status,attempts,last_error,next_attempt_at,updated_at FROM cloud_update_items WHERE job_id=? AND status='failed' AND attempts>=4",
    args:[resolvedJobId],
  });
  const retryRows=rows.rows.filter(row=>!classifyCloudUpdateError(row.last_error).expectedSkip);
  const skipRows=rows.rows.filter(row=>classifyCloudUpdateError(row.last_error).expectedSkip);
  const now=new Date().toISOString();

  if(retryRows.length) await db.executeMany(retryRows.map(row=>({
    sql:"UPDATE cloud_update_items SET status='waiting',attempts=0,last_error=NULL,next_attempt_at=NULL,updated_at=? WHERE job_id=? AND symbol=? AND status='failed'",
    args:[now,resolvedJobId,String(row.symbol)],
  })));
  if(skipRows.length) await db.executeMany(skipRows.map(row=>({
    sql:"UPDATE cloud_update_items SET status='skipped',next_attempt_at=NULL,updated_at=? WHERE job_id=? AND symbol=? AND status='failed'",
    args:[now,resolvedJobId,String(row.symbol)],
  })));

  // Arithmetic counter repair replaces the old SUM/COUNT scan over all items.
  const processed=Math.max(0,Number(job.processed_symbols??0)-retryRows.length);
  const failed=Math.max(0,Number(job.failed_symbols??0)-retryRows.length-skipRows.length);
  const skipped=Math.max(0,Number(job.skipped_symbols??0)+skipRows.length);
  const pending=Math.max(0,Number(job.total_symbols??0)-processed);
  await db.execute({
    sql:`UPDATE cloud_update_jobs SET status=?,processed_symbols=?,failed_symbols=?,skipped_symbols=?,completed_at=NULL,last_error=NULL,updated_at=? WHERE id=?`,
    args:[pending>0?"waiting":"completed",processed,failed,skipped,now,resolvedJobId],
  });
  try {
    await db.execute({sql:"UPDATE daily_update_pipeline_state SET status='waiting',stage='等待市場資料重試',completed_at=NULL,last_error=NULL,updated_at=? WHERE job_id=?",args:[now,resolvedJobId]});
  } catch {
    // Older databases may not have the unified post-processing table yet.
  }
  return {ok:true,jobId:resolvedJobId,retried:retryRows.length,skipped:skipRows.length,pending};
}
export type StableCloudStatus = {
  ok: boolean;
  degraded?: boolean;
  error?: string;
  id: string | null;
  jobId: string | null;
  status: string;
  total_symbols: number;
  processed_symbols: number;
  success_symbols: number;
  failed_symbols: number;
  skipped_symbols: number;
  current_symbol: string | null;
  percentage: number;
  remaining: number;
  batch_size: number;
  last_error: string | null;
  started_at: string | null;
  updated_at: string | null;
  completed_at: string | null;
  lastSchedulerRun: DatabaseRow | null;
};

function emptyCloudStatus(overrides: Partial<StableCloudStatus> = {}): StableCloudStatus {
  return {
    ok: true,
    id: null,
    jobId: null,
    status: "not_started",
    total_symbols: 0,
    processed_symbols: 0,
    success_symbols: 0,
    failed_symbols: 0,
    skipped_symbols: 0,
    current_symbol: null,
    percentage: 0,
    remaining: 0,
    batch_size: 0,
    last_error: null,
    started_at: null,
    updated_at: null,
    completed_at: null,
    lastSchedulerRun: null,
    ...overrides,
  };
}

export async function getCloudStatus(options: { jobId?: string | null; jobDate?: string | null } = {}): Promise<StableCloudStatus> {
  try {
    // M8.10.12: status reads may be scoped to one explicit job identity.
    // The development-center creates `${YYYY-MM-DD}-development` jobs while
    // generic cloud jobs use `${YYYY-MM-DD}`. Reading "latest updated" could
    // therefore display/resume the wrong header (including an old 0/0 orphan).
    // Keep the hot path to exactly one indexed/single-row lookup.
    const db = await database({ migrate: false });
    const resolvedJobId = String(options.jobId ?? "").trim();
    const resolvedJobDate = String(options.jobDate ?? "").trim();
    const query: DatabaseStatement | null = resolvedJobId
      ? { sql: "SELECT * FROM cloud_update_jobs WHERE id=? LIMIT 1", args: [resolvedJobId] }
      : resolvedJobDate
        ? { sql: "SELECT * FROM cloud_update_jobs WHERE job_date=? LIMIT 1", args: [resolvedJobDate] }
        : null;
    const active = !query
      ? await resolveActiveDevelopmentJob(db, null, { repair: true })
      : null;
    const jobResult = query
      ? await executeStatusQueryWithRetry<JobRow>(db, query)
      : { rows: active?.job ? [active.job as JobRow] : [] as JobRow[], rowsAffected: 0 };

    // Scheduler history is not needed by the live progress UI. Keep this hot
    // status path to one core Turso query; history/diagnostics have separate APIs.
    const lastSchedulerRun: DatabaseRow | null = null;
    const job = jobResult.rows[0];

    if (!job) return emptyCloudStatus({ lastSchedulerRun });

    const total = Number(job.total_symbols ?? 0);
    const processed = Number(job.processed_symbols ?? 0);
    const success = Number(job.success_symbols ?? 0);
    const failed = Number(job.failed_symbols ?? 0);
    const percentage = total > 0
      ? Math.min(100, Math.max(0, Math.round((processed / total) * 10000) / 100))
      : 0;

    return emptyCloudStatus({
      id: String(job.id ?? "") || null,
      jobId: String(job.id ?? "") || null,
      status: String(job.status ?? "waiting"),
      total_symbols: total,
      processed_symbols: processed,
      success_symbols: success,
      failed_symbols: failed,
      skipped_symbols: Number(job.skipped_symbols ?? 0),
      current_symbol: job.current_symbol == null ? null : String(job.current_symbol),
      percentage,
      remaining: Math.max(0, total - processed),
      batch_size: Number(job.batch_size ?? 0),
      last_error: job.last_error == null ? null : String(job.last_error),
      started_at: job.started_at == null ? null : String(job.started_at),
      updated_at: job.updated_at == null ? null : String(job.updated_at),
      completed_at: job.completed_at == null ? null : String(job.completed_at),
      lastSchedulerRun,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[getCloudStatus] degraded fallback:", message);
    return emptyCloudStatus({
      degraded: true,
      error: message,
      status: "unavailable",
      last_error: message,
    });
  }
}
