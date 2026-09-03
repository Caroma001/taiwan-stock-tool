import { randomUUID } from "node:crypto";
import { TursoDatabaseAdapter } from "@/adapters/turso";
import { getTursoClient } from "@/lib/turso";
import { MigrationRunner } from "@/migrations/database/MigrationRunner";
import { tursoMigrations } from "@/migrations/turso";
import { refreshMarketData } from "@/lib/market/service";
import { processCloudBatch } from "@/lib/cloud/jobs";
import { persistActiveDevelopmentJob, resolveActiveDevelopmentJob } from "@/lib/cloud/active-job";
import { getDevelopmentModeConfig } from "@/lib/development/config";
import type { DatabaseRow } from "@/lib/database";
import { syncCandidateChipDataEfficient } from "@/lib/chip-data";
import { getInstitutionalStealthCandidates, refreshInstitutionalStealth } from "@/lib/institutional-stealth/service";
import { classifyDailyUniverseStock } from "@/lib/development/market-universe";
import { resolveEffectiveTradingDate } from "@/lib/development/trading-date";
import { refreshCandidateRiskIntelligence } from "@/lib/risk-intelligence/service";
import { refreshSwing10DailySnapshot } from "@/lib/swing10/service";
import { refreshEarlyWatch } from "@/lib/early-watch/service";
import { generateDailyIntegratedReport } from "@/lib/daily-report/service";
import { refreshBruceSwingScores } from "@/lib/m8121/bruce-swing-score";
import { refreshM8121DataQuality } from "@/lib/m8121/quality-service";

interface JobRow extends DatabaseRow {
  id: string;
  status: string;
  total_symbols: number;
  processed_symbols: number;
  success_symbols: number;
  failed_symbols: number;
  skipped_symbols: number | null;
  batch_size: number;
  current_symbol: string | null;
  updated_at: string;
}

const USER_NAME = "bruce";
const todayTaipei = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

async function database(options: { migrate?: boolean } = {}) {
  const db = new TursoDatabaseAdapter(getTursoClient());
  if (options.migrate !== false) {
    await new MigrationRunner(db, tursoMigrations).migrate();
  }
  return db;
}

async function ensurePipelineIdentity(db: TursoDatabaseAdapter, jobId: string) {
  const now = new Date().toISOString();
  await db.execute({
    sql: `INSERT OR IGNORE INTO daily_update_pipeline_state(
      job_id,status,stage,candidate_count,chip_success,chip_failed,breakout_scored,stealth_scored,radar_failed,
      detail_json,last_error,started_at,updated_at,completed_at
    ) VALUES(?,?,?,0,0,0,0,0,0,NULL,NULL,?,?,NULL)`,
    args: [jobId, "waiting", "等待市場資料完成", now, now],
  }).catch(() => undefined);
}

function unifiedCloudStatusFromActive(active: Awaited<ReturnType<typeof resolveActiveDevelopmentJob>>) {
  const job = active.job;
  if (!job || !active.jobId) {
    return {
      ok: true, id: null, jobId: null, status: "not_started", total_symbols: 0, processed_symbols: 0,
      success_symbols: 0, failed_symbols: 0, skipped_symbols: 0, current_symbol: null, percentage: 0,
      remaining: 0, batch_size: 0, last_error: null, started_at: null, updated_at: null, completed_at: null,
    };
  }
  const total = Number(job.total_symbols ?? 0);
  const processed = Number(job.processed_symbols ?? 0);
  const percentage = total > 0 ? Math.min(100, Math.max(0, Math.round((processed / total) * 10000) / 100)) : 0;
  return {
    ok: true,
    id: active.jobId,
    jobId: active.jobId,
    status: String(job.status ?? "waiting"),
    total_symbols: total,
    processed_symbols: processed,
    success_symbols: Number(job.success_symbols ?? 0),
    failed_symbols: Number(job.failed_symbols ?? 0),
    skipped_symbols: Number(job.skipped_symbols ?? 0),
    current_symbol: job.current_symbol == null ? null : String(job.current_symbol),
    percentage,
    remaining: Math.max(0, total - processed),
    batch_size: Number(job.batch_size ?? 0),
    last_error: job.last_error == null ? null : String(job.last_error),
    started_at: job.started_at == null ? null : String(job.started_at),
    updated_at: job.updated_at == null ? null : String(job.updated_at),
    completed_at: job.completed_at == null ? null : String(job.completed_at),
  };
}

function pipelineFromActiveJob(job: DatabaseRow | null) {
  if (!job || !job.pipeline_job_id) return null;
  return {
    job_id: String(job.pipeline_job_id),
    status: String(job.pipeline_status ?? "waiting"),
    stage: String(job.pipeline_stage ?? "等待市場資料完成"),
    candidate_count: Number(job.pipeline_candidate_count ?? 0),
    chip_success: Number(job.pipeline_chip_success ?? 0),
    chip_failed: Number(job.pipeline_chip_failed ?? 0),
    breakout_scored: Number(job.pipeline_breakout_scored ?? 0),
    stealth_scored: Number(job.pipeline_stealth_scored ?? 0),
    radar_failed: Number(job.pipeline_radar_failed ?? 0),
    last_error: job.pipeline_last_error == null ? null : String(job.pipeline_last_error),
    started_at: job.pipeline_started_at == null ? null : String(job.pipeline_started_at),
    updated_at: job.pipeline_updated_at == null ? null : String(job.pipeline_updated_at),
    completed_at: job.pipeline_completed_at == null ? null : String(job.pipeline_completed_at),
    detail: null,
  };
}

export async function getPrioritySymbols(options: { migrate?: boolean } = {}): Promise<string[]> {
  const db = await database({ migrate: options.migrate });
  const result = await db.execute<{ symbol: string }>({
    sql: `SELECT DISTINCT symbol FROM (
      SELECT symbol FROM portfolio_lots
        WHERE user_name=? AND status='open' AND remaining_lots>0
      UNION ALL
      SELECT symbol FROM watchlist WHERE user_name=?
      UNION ALL
      SELECT symbol FROM hot_stock_candidates WHERE is_active=1
      UNION ALL
      SELECT symbol FROM top30_snapshots
        WHERE snapshot_date=(SELECT MAX(snapshot_date) FROM top30_snapshots)
    ) WHERE symbol IS NOT NULL AND TRIM(symbol)<>'' ORDER BY symbol`,
    args: [USER_NAME, USER_NAME],
  });
  return result.rows.map((row) => String(row.symbol));
}

export async function startDevelopmentDailyUpdate(options: { reset?: boolean } = {}) {
  const config = getDevelopmentModeConfig();
  const db = await database();
  const tradingDate = await resolveEffectiveTradingDate();
  const dateKey = tradingDate.jobDate;
  const now = new Date().toISOString();

  const existing = await db.execute<JobRow>({
    sql: "SELECT * FROM cloud_update_jobs WHERE job_date=? LIMIT 1",
    args: [dateKey],
  });
  const existingJob = existing.rows[0];

  /**
   * M8.10.20 empty-job recovery guard
   *
   * Turso quota blocking can interrupt a job between creating the job header
   * and creating its queue items. Older versions then kept "resuming" a 0/0
   * job forever. We now validate an unfinished job before treating it as
   * resumable. The validation uses only the compact job row plus a LIMIT 1
   * existence probe, so it does not reintroduce the M8.10.9 Rows Read problem.
   */
  let orphanReason: string | null = null;
  if (existingJob) {
    const total = Number(existingJob.total_symbols ?? 0);
    const processed = Number(existingJob.processed_symbols ?? 0);

    if (!Number.isFinite(total) || total <= 0) {
      orphanReason = "total_symbols 為 0，屬於額度中斷期間留下的殘缺任務";
    } else if (!Number.isFinite(processed) || processed < 0 || processed > total) {
      orphanReason = "processed_symbols 與 total_symbols 不一致";
    } else {
      const probe = await db.execute<DatabaseRow>({
        sql: "SELECT symbol FROM cloud_update_items WHERE job_id=? LIMIT 1",
        args: [String(existingJob.id)],
      });
      if (!probe.rows[0]) {
        orphanReason = "任務表存在，但 cloud_update_items 沒有任何排程項目";
      }
    }
  }

  if (existingJob && !options.reset && !orphanReason) {
    const jobId = String(existingJob.id);
    const status = String(existingJob.status ?? "waiting");
    await persistActiveDevelopmentJob(db, jobId, dateKey, "start-development");
    await ensurePipelineIdentity(db, jobId);

    if (status === "completed") {
      const prioritySymbols = await getPrioritySymbols({ migrate: false });
      return {
        ok: true,
        mode: "development",
        manualOnly: true,
        calendarDate: tradingDate.calendarDate,
        effectiveTradingDate: tradingDate.effectiveTradingDate,
        tradingDateSource: tradingDate.source,
        tradingDateReason: tradingDate.reason,
        resumed: false,
        alreadyCompleted: true,
        repairedOrphan: false,
        jobId,
        batchSize: Number(existingJob.batch_size || config.batchSize),
        totalSymbols: Number(existingJob.total_symbols || 0),
        prioritySymbols,
        market: null,
        message: `${tradingDate.effectiveTradingDate} 交易日更新已完成；不會重新從 0 開始。如需重跑，請使用重建任務功能。`,
      };
    }

    await db.execute({
      sql: "UPDATE cloud_update_jobs SET status='running',batch_size=?,updated_at=? WHERE id=?",
      args: [config.batchSize, now, jobId],
    });

    const prioritySymbols = await getPrioritySymbols({ migrate: false });
    return {
      ok: true,
      mode: "development",
      manualOnly: true,
      calendarDate: tradingDate.calendarDate,
      effectiveTradingDate: tradingDate.effectiveTradingDate,
      tradingDateSource: tradingDate.source,
      tradingDateReason: tradingDate.reason,
      resumed: true,
      alreadyCompleted: false,
      repairedOrphan: false,
      jobId,
      batchSize: config.batchSize,
      totalSymbols: Number(existingJob.total_symbols || 0),
      prioritySymbols,
      market: null,
      message: `已找到 ${tradingDate.effectiveTradingDate} 交易日未完成工作，將從上次中斷位置續傳，不會重新從 0 開始。`,
    };
  }

  // Rebuild is explicit (reset=true) or automatic when an orphan 0/0 job is detected.
  const prioritySymbols = await getPrioritySymbols({ migrate: false });
  const market = await refreshMarketData();
  const stocks = await db.execute<{ symbol: string; name: string; market: string; industry: string | null; is_active: number }>({
    sql: "SELECT symbol,name,market,industry,is_active FROM stocks WHERE is_active=1 ORDER BY symbol",
  });

  if (!stocks.rows.length) {
    throw new Error(
      "M8.10.20 無法建立每日任務：stocks 主檔沒有有效股票。請先確認 Turso 資料庫與市場主檔同步，不會建立 0/0 任務。",
    );
  }

  const prioritySet = new Set(prioritySymbols.map((symbol) => String(symbol).trim()));
  const universe = stocks.rows.map((row) => ({
    row,
    // A manually held/watched symbol is always kept current even if it is an
    // ETF or another product outside the automatic stock-picking universe.
    decision: prioritySet.has(String(row.symbol).trim())
      ? { eligible: true, reason: null }
      : classifyDailyUniverseStock(row),
  }));
  const eligibleRows = universe.filter((item) => item.decision.eligible);
  const skippedRows = universe.filter((item) => !item.decision.eligible);

  if (eligibleRows.length + skippedRows.length !== stocks.rows.length) {
    throw new Error("M8.10.20 Universe 驗證失敗：eligible + skipped 與 stocks 總數不一致。");
  }

  const jobId = existingJob?.id ? String(existingJob.id) : randomUUID();

  await db.transaction(async (tx) => {
    if (existingJob) {
      await tx.execute({
        sql: `UPDATE cloud_update_jobs SET status='waiting',total_symbols=?,processed_symbols=?,
          success_symbols=0,failed_symbols=0,skipped_symbols=?,batch_size=?,current_symbol=NULL,last_error=NULL,
          started_at=NULL,updated_at=?,completed_at=NULL WHERE id=?`,
        args: [stocks.rows.length, skippedRows.length, skippedRows.length, config.batchSize, now, jobId],
      });
      await tx.execute({ sql: "DELETE FROM cloud_update_items WHERE job_id=?", args: [jobId] });
      // A rebuilt market job must not inherit stale Winner25 / Stealth postprocess
      // state from a previous incarnation of the same job id.
      await tx.execute({
        sql: "DELETE FROM daily_update_pipeline_state WHERE job_id=?",
        args: [jobId],
      }).catch(() => undefined);
    } else {
      await tx.execute({
        sql: `INSERT INTO cloud_update_jobs(id,job_date,status,total_symbols,processed_symbols,success_symbols,failed_symbols,skipped_symbols,batch_size,updated_at)
          VALUES(?,?,?,?,?,0,0,?,?,?)`,
        args: [jobId, dateKey, "waiting", stocks.rows.length, skippedRows.length, skippedRows.length, config.batchSize, now],
      });
    }

    if (eligibleRows.length) {
      await tx.executeMany(
        eligibleRows.map(({ row }) => ({
          sql: "INSERT INTO cloud_update_items(job_id,symbol,status,attempts,next_attempt_at,updated_at) VALUES(?,?,?,0,NULL,?)",
          args: [jobId, String(row.symbol), "waiting", now],
        })),
      );
    }
    if (skippedRows.length) {
      await tx.executeMany(
        skippedRows.map(({ row, decision }) => ({
          sql: "INSERT INTO cloud_update_items(job_id,symbol,status,attempts,last_error,next_attempt_at,updated_at) VALUES(?,?,?,0,?,NULL,?)",
          args: [jobId, String(row.symbol), "skipped", decision.reason ?? "市場清單略過：非普通股商品", now],
        })),
      );
    }
  });

  // M8.10.20 post-build guard. This is deliberately LIMIT 1 rather than COUNT(*)
  // so the safety check costs almost nothing in Turso Rows Read.
  const [jobCheck, itemCheck] = await Promise.all([
    db.execute<JobRow>({
      sql: "SELECT * FROM cloud_update_jobs WHERE id=? LIMIT 1",
      args: [jobId],
    }),
    db.execute<DatabaseRow>({
      sql: "SELECT symbol,status FROM cloud_update_items WHERE job_id=? LIMIT 1",
      args: [jobId],
    }),
  ]);
  const createdJob = jobCheck.rows[0];
  const createdTotal = Number(createdJob?.total_symbols ?? 0);

  if (!createdJob || createdTotal <= 0 || !itemCheck.rows[0]) {
    const errorMessage =
      "M8.10.20 任務建立驗證失敗：未建立有效 total_symbols / cloud_update_items，已阻止 0/0 任務進入自動續傳。";
    if (createdJob) {
      await db.execute({
        sql: "UPDATE cloud_update_jobs SET status='failed',last_error=?,updated_at=? WHERE id=?",
        args: [errorMessage, new Date().toISOString(), jobId],
      });
    }
    throw new Error(errorMessage);
  }

  await persistActiveDevelopmentJob(db, jobId, dateKey, "start-development");
  await ensurePipelineIdentity(db, jobId);

  const repairedOrphan = Boolean(orphanReason);
  return {
    ok: true,
    mode: "development",
    manualOnly: true,
    calendarDate: tradingDate.calendarDate,
    effectiveTradingDate: tradingDate.effectiveTradingDate,
    tradingDateSource: tradingDate.source,
    tradingDateReason: tradingDate.reason,
    resumed: false,
    alreadyCompleted: false,
    repairedOrphan,
    orphanReason,
    jobId,
    batchSize: config.batchSize,
    totalSymbols: createdTotal,
    eligibleSymbols: eligibleRows.length,
    skippedSymbols: skippedRows.length,
    prioritySymbols,
    market,
    message: repairedOrphan
      ? `M8.10.20 已自動修復空 Job / 0/0 殘缺任務（${orphanReason}）。重新建立 ${createdTotal} 檔：普通股更新 ${eligibleRows.length} 檔；${skippedRows.length} 檔預先略過。`
      : `每日一鍵更新已建立。普通股更新 ${eligibleRows.length} 檔；${skippedRows.length} 檔 ETF／權證／非普通股商品已預先略過。`,
  };
}

async function refreshPortfolioPlans() {
  const db = await database({ migrate: false });
  const lots = await db.execute<DatabaseRow>({
    sql: `SELECT pl.id,pl.symbol,d.recommendation,d.target_1,d.target_2,d.stop_loss,
      d.confidence,d.reason,a.total_score
      FROM portfolio_lots pl
      LEFT JOIN decision_latest d ON d.symbol=pl.symbol
      LEFT JOIN ai_analysis_latest a ON a.symbol=pl.symbol
      WHERE pl.user_name=? AND pl.status='open' AND pl.remaining_lots>0`,
    args: [USER_NAME],
  });

  let completed = 0;
  let failed = 0;
  const decisionDate = todayTaipei();
  const createdAt = new Date().toISOString();

  for (const row of lots.rows) {
    try {
      if (!row.recommendation) throw new Error("尚無決策資料");
      await db.execute({
        sql: `INSERT INTO ai_decisions(id,user_name,lot_id,symbol,decision_date,recommendation,
          target_1,target_2,stop_loss,confidence,total_score,reason,created_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(lot_id,decision_date) DO UPDATE SET
          recommendation=excluded.recommendation,target_1=excluded.target_1,
          target_2=excluded.target_2,stop_loss=excluded.stop_loss,
          confidence=excluded.confidence,total_score=excluded.total_score,
          reason=excluded.reason,created_at=excluded.created_at`,
        args: [
          randomUUID(), USER_NAME, row.id, row.symbol, decisionDate,
          row.recommendation, row.target_1, row.target_2, row.stop_loss,
          row.confidence, row.total_score, row.reason, createdAt,
        ],
      });
      completed += 1;
    } catch {
      failed += 1;
    }
  }
  return { completed, failed };
}

async function markHotStocksUpdated() {
  const db = await database({ migrate: false });
  const now = new Date().toISOString();
  await db.execute({
    sql: `UPDATE hot_stock_candidates SET status='completed',last_error=NULL,
      analyzed_at=?,updated_at=? WHERE is_active=1 AND symbol IN
      (SELECT symbol FROM decision_latest)`,
    args: [now, now],
  });
}

type DailyPipelineRow = DatabaseRow & {
  job_id: string;
  status: string;
  stage: string;
  candidate_count: number;
  chip_success: number;
  chip_failed: number;
  breakout_scored: number;
  stealth_scored: number;
  radar_failed: number;
  detail_json: string | null;
  last_error: string | null;
  started_at: string | null;
  updated_at: string;
  completed_at: string | null;
};

async function readPipelineState(jobId: string | null) {
  if (!jobId) return null;
  const db = await database({ migrate: false });
  try {
    const result = await db.execute<DailyPipelineRow>({
      sql: "SELECT * FROM daily_update_pipeline_state WHERE job_id=? LIMIT 1",
      args: [jobId],
    });
    const row = result.rows[0];
    if (!row) return null;
    let detail: Record<string, unknown> | null = null;
    try { detail = row.detail_json ? JSON.parse(String(row.detail_json)) : null; } catch { detail = null; }
    return { ...row, detail };
  } catch {
    // During an upgrade, status polling may happen before migration 24 has run.
    return null;
  }
}

async function writePipelineState(jobId: string, patch: {
  status: string;
  stage: string;
  candidateCount?: number;
  chipSuccess?: number;
  chipFailed?: number;
  breakoutScored?: number;
  stealthScored?: number;
  radarFailed?: number;
  detail?: unknown;
  lastError?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}) {
  // M8.10.9: migration is performed when the daily job starts. Repeated stage
  // updates must not reread schema_migrations for every 8-symbol chunk.
  const db = await database({ migrate: false });
  const now = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO daily_update_pipeline_state(
      job_id,status,stage,candidate_count,chip_success,chip_failed,breakout_scored,stealth_scored,radar_failed,
      detail_json,last_error,started_at,updated_at,completed_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(job_id) DO UPDATE SET
      status=excluded.status,stage=excluded.stage,candidate_count=excluded.candidate_count,
      chip_success=excluded.chip_success,chip_failed=excluded.chip_failed,
      breakout_scored=excluded.breakout_scored,stealth_scored=excluded.stealth_scored,radar_failed=excluded.radar_failed,
      detail_json=excluded.detail_json,last_error=excluded.last_error,
      started_at=COALESCE(daily_update_pipeline_state.started_at,excluded.started_at),
      updated_at=excluded.updated_at,completed_at=excluded.completed_at`,
    args: [
      jobId, patch.status, patch.stage, patch.candidateCount ?? 0,
      patch.chipSuccess ?? 0, patch.chipFailed ?? 0, patch.breakoutScored ?? 0,
      patch.stealthScored ?? 0, patch.radarFailed ?? 0,
      patch.detail == null ? null : JSON.stringify(patch.detail), patch.lastError ?? null,
      patch.startedAt ?? now, now, patch.completedAt ?? null,
    ],
  });
}

/**
 * M8.10.6 single daily pipeline.
 * This runs once after the full-market price/flow job completes:
 * 1) chip data for the exact Stealth Radar Top40 candidate universe;
 * 2) Winner25 live score + institutional stealth score for those 40 candidates.
 * It deliberately DOES NOT rebuild the Top20 performance cohort every day.
 */
export async function finalizeDevelopmentDailyUpdate(jobId?: string | null) {
  const resolvedJobId = jobId || "manual-postprocess";
  const existing = await readPipelineState(resolvedJobId);
  if (existing?.status === "completed") {
    return { ok: true, cached: true, ...existing };
  }

  const startedAt = new Date().toISOString();
  await writePipelineState(resolvedJobId, { status: "running", stage: "準備 Swing10 底層候選", startedAt });

  try {
    await markHotStocksUpdated();
    const symbols = await getInstitutionalStealthCandidates(40);
    if (!symbols.length) throw new Error("每日更新完成，但找不到 Swing10 底層候選股票。");

    await writePipelineState(resolvedJobId, {
      status: "running", stage: "更新法人籌碼", candidateCount: symbols.length, startedAt,
    });

    const chipDb = await database({ migrate: false });
    const jobDateRow = await chipDb.execute<DatabaseRow>({ sql: "SELECT job_date FROM cloud_update_jobs WHERE id=? LIMIT 1", args: [resolvedJobId] });
    const targetTradeDate = String(jobDateRow.rows[0]?.job_date ?? todayTaipei()).match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? todayTaipei();
    const activeSwing10 = await chipDb.execute<DatabaseRow>({
      sql:`SELECT DISTINCT sp.symbol FROM swing10_trade_positions sp
           JOIN portfolio_lots pl ON pl.id=sp.lot_id
           WHERE pl.user_name='Bruce' AND pl.status='open' AND pl.remaining_lots>0`,
    }).catch(()=>({rows:[] as readonly DatabaseRow[],rowsAffected:0}));
    const monitoredSet=new Set<string>(symbols.map(String).filter(Boolean));
    for(const row of activeSwing10.rows){
      const symbol=String(row.symbol??"").trim();
      if(symbol) monitoredSet.add(symbol);
    }
    const monitoredSymbols=[...monitoredSet];
    const chip = await syncCandidateChipDataEfficient(symbols, targetTradeDate);
    const chipSuccess = Number(chip.trust?.success ?? 0) + Number(chip.foreign?.success ?? 0) + Number(chip.distribution?.success ?? 0);
    const chipFailed = Number(chip.trust?.failed ?? 0) + Number(chip.foreign?.failed ?? 0) + Number(chip.distribution?.failed ?? 0);

    await writePipelineState(resolvedJobId, {
      status: "running", stage: "Winner25 + 法人潛伏即時評分", candidateCount: symbols.length,
      chipSuccess, chipFailed, startedAt, detail: { chip },
    });

    // Keep each database/API unit bounded. The user only clicks once; the server owns the batching.
    let breakoutScored = 0;
    let stealthScored = 0;
    let radarFailed = 0;
    const radarErrors: Array<{ symbol: string; error: string }> = [];
    for (let i = 0; i < monitoredSymbols.length; i += 8) {
      const chunk = monitoredSymbols.slice(i, i + 8);
      const result = await refreshInstitutionalStealth(chunk, chunk.length);
      breakoutScored += Number(result.breakoutScored ?? 0);
      stealthScored += Number(result.stealthScored ?? 0);
      radarFailed += Number(result.failed ?? 0);
      if (Array.isArray(result.errors)) radarErrors.push(...result.errors);
      await writePipelineState(resolvedJobId, {
        status: "running",
        stage: `法人潛伏底層評分 ${Math.min(i + chunk.length, monitoredSymbols.length)}/${monitoredSymbols.length}`,
        candidateCount: symbols.length, chipSuccess, chipFailed, breakoutScored, stealthScored, radarFailed,
        startedAt, detail: { chip, radarErrors: radarErrors.slice(-20) },
      });
    }

    let riskIntelligence: Awaited<ReturnType<typeof refreshCandidateRiskIntelligence>> | null = null;
    let riskIntelligenceError: string | null = null;
    try {
      await writePipelineState(resolvedJobId, {
        status: "running", stage: "大盤風險／融資清洗／外資續航／當沖雜訊評分",
        candidateCount: symbols.length, chipSuccess, chipFailed, breakoutScored, stealthScored, radarFailed,
        startedAt, detail: { chip, radarErrors: radarErrors.slice(-20) },
      });
      // M8.10.25 is a best-effort decision overlay. It reads/fetches public data
      // in bulk and only scores Top40; failure must never invalidate the already
      // completed Winner25/Stealth daily pipeline.
      riskIntelligence = await refreshCandidateRiskIntelligence(chipDb, monitoredSymbols, targetTradeDate);
    } catch (error) {
      riskIntelligenceError = error instanceof Error ? error.message : String(error);
    }

    let earlyWatch: Awaited<ReturnType<typeof refreshEarlyWatch>> | null = null;
    let earlyWatchError: string | null = null;
    try {
      await writePipelineState(resolvedJobId, {
        status: "running", stage: "Early Watch 基本面加速度／價格未反映掃描",
        candidateCount: symbols.length, chipSuccess, chipFailed, breakoutScored, stealthScored, radarFailed,
        startedAt, detail: { chip, radarErrors: radarErrors.slice(-20), riskIntelligence },
      });
      earlyWatch = await refreshEarlyWatch(chipDb, targetTradeDate);
    } catch (error) {
      earlyWatchError = error instanceof Error ? error.message : String(error);
    }

    let swing10: Awaited<ReturnType<typeof refreshSwing10DailySnapshot>> | null = null;
    let swing10Error: string | null = null;
    try {
      await writePipelineState(resolvedJobId, {
        status: "running", stage: "建立 A級 Swing10 收盤觀察",
        candidateCount: symbols.length, chipSuccess, chipFailed, breakoutScored, stealthScored, radarFailed,
        startedAt, detail: { chip, radarErrors: radarErrors.slice(-20), riskIntelligence, earlyWatch },
      });
      swing10 = await refreshSwing10DailySnapshot(chipDb, targetTradeDate, symbols);
    } catch (error) {
      swing10Error = error instanceof Error ? error.message : String(error);
    }

    let bruceScore: Awaited<ReturnType<typeof refreshBruceSwingScores>> | null = null;
    let bruceScoreError: string | null = null;
    try {
      bruceScore = await refreshBruceSwingScores(chipDb, targetTradeDate);
    } catch (error) {
      bruceScoreError = error instanceof Error ? error.message : String(error);
    }

    let dailyReport: Awaited<ReturnType<typeof generateDailyIntegratedReport>> | null = null;
    let dailyReportError: string | null = null;
    try {
      await writePipelineState(resolvedJobId, {
        status: "running", stage: "產生每日綜合分析報告／Fast5",
        candidateCount: symbols.length, chipSuccess, chipFailed, breakoutScored, stealthScored, radarFailed,
        startedAt, detail: { chip, radarErrors: radarErrors.slice(-20), riskIntelligence, earlyWatch, swing10 },
      });
      dailyReport = await generateDailyIntegratedReport(chipDb, targetTradeDate);
      await refreshM8121DataQuality(chipDb, targetTradeDate).catch(() => undefined);
    } catch (error) {
      dailyReportError = error instanceof Error ? error.message : String(error);
    }

    const warnings: string[] = [];
    if (chipFailed) warnings.push(`籌碼 ${chipFailed} 筆同步未完成`);
    if (radarFailed) warnings.push(`法人潛伏底層評分 ${radarFailed} 檔失敗`);
    if (riskIntelligenceError) warnings.push(`M8.11.10 風險情報待補：${riskIntelligenceError}`);
    if (earlyWatchError) warnings.push(`M8.11.10 Early Watch 待補：${earlyWatchError}`);
    if (swing10Error) warnings.push(`M8.11.10 Swing10 交易層待補：${swing10Error}`);
    if (bruceScoreError) warnings.push(`M8.12.1 Bruce Score 待補：${bruceScoreError}`);
    if (dailyReportError) warnings.push(`M8.12.1 綜合日報／訓練檔待補：${dailyReportError}`);
    const completedAt = new Date().toISOString();
    const dailyReportSummary = dailyReport ? { reportDate: dailyReport.reportDate, headline: dailyReport.conclusion.headline, fast5: dailyReport.fastTrack.top5.length } : null;
    const detail = { chip, radarErrors: radarErrors.slice(-20), symbols, monitoredSymbols, riskIntelligence, riskIntelligenceError, earlyWatch, earlyWatchError, swing10, swing10Error, bruceScore: bruceScore ? { written: bruceScore.written, top: bruceScore.rows.slice(0,5) } : null, bruceScoreError, dailyReport: dailyReportSummary, dailyReportError };
    await writePipelineState(resolvedJobId, {
      status: "completed", stage: warnings.length ? "完成（部分資料待補）" : "全部完成",
      candidateCount: symbols.length, chipSuccess, chipFailed, breakoutScored, stealthScored, radarFailed,
      detail, lastError: warnings.length ? warnings.join("；") : null, startedAt, completedAt,
    });
    return {
      ok: true, cached: false, status: "completed", stage: warnings.length ? "完成（部分資料待補）" : "全部完成",
      candidateCount: symbols.length, chipSuccess, chipFailed, breakoutScored, stealthScored, radarFailed,
      riskIntelligence, riskIntelligenceError, earlyWatch, earlyWatchError, swing10, swing10Error, dailyReport: dailyReportSummary, dailyReportError, warnings, completedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writePipelineState(resolvedJobId, {
      status: "failed", stage: "後處理失敗", lastError: message, startedAt,
    }).catch(() => undefined);
    throw error;
  }
}

export async function runDevelopmentUpdateStep(
  jobId: string,
  options: { heartbeat?: (phase: string, processed?: number) => Promise<void> } = {},
) {
  const batch = await processCloudBatch(jobId, options);
  let finalization: Awaited<ReturnType<typeof finalizeDevelopmentDailyUpdate>> | null = null;
  if (batch.status === "completed" || Number(batch.pending ?? 0) === 0) {
    await options.heartbeat?.("市場資料完成：開始法人／Winner25／潛伏後處理", Number(batch.processed ?? 0));
    finalization = await finalizeDevelopmentDailyUpdate(jobId);
    await options.heartbeat?.("法人／Winner25／潛伏後處理完成", Number(batch.processed ?? 0));
  }
  return { ...batch, finalization };
}


function isoMs(value: unknown) {
  const parsed = value == null ? Number.NaN : Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function queueHeartbeatFromActive(
  job: DatabaseRow | null,
  remaining: number,
  bulkNextRetryAt?: string | null,
) {
  if (!job) {
    return {
      state: "idle",
      displayState: "尚未建立 Queue",
      generation: 1,
      continuationId: null,
      predecessorContinuationId: null,
      consumedContinuationId: null,
      heartbeatContinuationId: null,
      messageId: null,
      phase: null,
      publishedAt: null,
      consumedAt: null,
      heartbeatAt: null,
      completedAt: null,
      lastError: null,
      publishCount: 0,
      consumeCount: 0,
      recoveryCount: 0,
      lastRecoveryReason: null,
      lastRecoveryAt: null,
      safetyPhase: null,
      safetyPublishedAt: null,
      safetyConsumedAt: null,
      safetyPublishCount: 0,
      safetyConsumeCount: 0,
      heartbeatAgeSeconds: null,
      publishedAgeSeconds: null,
      consumerAlive: false,
      waitingForConsumer: false,
      orphanedPublished: false,
      stalledConsumer: false,
      needsBootstrap: remaining > 0,
      bulkStartedAt: null,
    };
  }

  const now = Date.now();
  const state = String(job.queue_runtime_state ?? "idle");
  const generation = Math.max(1, Number(job.queue_generation ?? 1));
  const continuationId = job.queue_continuation_id == null
    ? null
    : String(job.queue_continuation_id);
  const consumedContinuationId = job.queue_consumed_continuation_id == null
    ? null
    : String(job.queue_consumed_continuation_id);
  const heartbeatContinuationId = job.queue_heartbeat_continuation_id == null
    ? null
    : String(job.queue_heartbeat_continuation_id);
  const publishedAt = job.queue_published_at == null
    ? null
    : String(job.queue_published_at);
  const rawConsumedAt = job.queue_consumed_at == null
    ? null
    : String(job.queue_consumed_at);
  const rawHeartbeatAt = job.queue_heartbeat_at == null
    ? null
    : String(job.queue_heartbeat_at);

  // Only timestamps tied to the CURRENT continuation are evidence that the
  // successor has actually been consumed/alive.
  const consumedAt = continuationId && consumedContinuationId === continuationId
    ? rawConsumedAt
    : null;
  const heartbeatAt = continuationId && heartbeatContinuationId === continuationId
    ? rawHeartbeatAt
    : null;

  const publishedMs = isoMs(publishedAt);
  const heartbeatMs = isoMs(heartbeatAt);
  const consumedMs = isoMs(consumedAt);
  const publishedAgeSeconds = publishedMs > 0
    ? Math.max(0, Math.floor((now - publishedMs) / 1000))
    : null;
  const heartbeatAgeSeconds = heartbeatMs > 0
    ? Math.max(0, Math.floor((now - heartbeatMs) / 1000))
    : null;
  const consumedAgeSeconds = consumedMs > 0
    ? Math.max(0, Math.floor((now - consumedMs) / 1000))
    : null;

  const cooldownUntil = bulkNextRetryAt ? Date.parse(bulkNextRetryAt) : Number.NaN;
  const coolingDown = Number.isFinite(cooldownUntil) && cooldownUntil > now;

  const consumerAlive = Boolean(
    continuationId
    && (
      (heartbeatAgeSeconds != null && heartbeatAgeSeconds <= 120)
      || (
        consumedAgeSeconds != null
        && consumedAgeSeconds <= 120
        && ["consuming","processing","recovery_consuming"].includes(state)
      )
    )
  );

  const waitingForConsumer = Boolean(
    continuationId
    && state === "published"
    && !consumedAt
    && publishedAgeSeconds != null
    && publishedAgeSeconds <= 150
  );

  const orphanedPublished = Boolean(
    continuationId
    && state === "published"
    && !consumedAt
    && publishedAgeSeconds != null
    && publishedAgeSeconds > 150
  );

  const stalledConsumer = Boolean(
    continuationId
    && consumedAt
    && !consumerAlive
    && heartbeatAgeSeconds != null
    && heartbeatAgeSeconds > 420
  );

  const recoveryLeaseUntil = job.queue_recovery_lease_until == null
    ? null
    : String(job.queue_recovery_lease_until);
  const recoveryLeaseActive = Boolean(
    recoveryLeaseUntil
    && Date.parse(recoveryLeaseUntil) > now
  );

  const noRuntimeContinuation = !continuationId
    && !["completed"].includes(state);

  const needsBootstrap = remaining > 0
    && !coolingDown
    && !consumerAlive
    && !waitingForConsumer
    && !recoveryLeaseActive
    && (
      noRuntimeContinuation
      || orphanedPublished
      || stalledConsumer
      || state === "idle"
      || state === "error"
    );

  let displayState = "等待 Queue";
  if (coolingDown) displayState = "資料源冷卻等待";
  else if (state === "completed" || remaining <= 0) displayState = "Queue 已完成";
  else if (recoveryLeaseActive || state === "recovery_claimed") displayState = "Durable Recovery v2 交接中";
  else if (consumerAlive) displayState = state === "recovery_consuming"
    ? `Generation ${generation} Recovery Consumer 執行中`
    : `Generation ${generation} Queue Consumer 執行中`;
  else if (waitingForConsumer) displayState = `Generation ${generation} 等待 successor Consume`;
  else if (orphanedPublished) displayState = `Generation ${generation} Orphan successor，準備 Recovery`;
  else if (stalledConsumer) displayState = `Generation ${generation} Consumer heartbeat 停滯`;
  else if (needsBootstrap) displayState = "Queue 停滯，準備 Durable Recovery v2";
  else if (state === "published") displayState = `Generation ${generation} Queue 已發布`;
  else displayState = state;

  return {
    state,
    displayState,
    generation,
    continuationId,
    predecessorContinuationId: job.queue_predecessor_continuation_id == null
      ? null
      : String(job.queue_predecessor_continuation_id),
    consumedContinuationId,
    heartbeatContinuationId,
    messageId: job.queue_runtime_message_id == null
      ? null
      : String(job.queue_runtime_message_id),
    source: job.queue_runtime_source == null
      ? null
      : String(job.queue_runtime_source),
    expectedProcessed: Number(job.queue_expected_processed ?? 0),
    phase: job.queue_phase == null ? null : String(job.queue_phase),
    publishedAt,
    consumedAt,
    heartbeatAt,
    completedAt: job.queue_completed_at == null
      ? null
      : String(job.queue_completed_at),
    lastError: job.queue_runtime_last_error == null
      ? null
      : String(job.queue_runtime_last_error),
    publishCount: Number(job.queue_publish_count ?? 0),
    consumeCount: Number(job.queue_consume_count ?? 0),
    recoveryCount: Number(job.queue_recovery_count ?? 0),
    lastRecoveryReason: job.queue_last_recovery_reason == null
      ? null
      : String(job.queue_last_recovery_reason),
    lastRecoveryAt: job.queue_last_recovery_at == null
      ? null
      : String(job.queue_last_recovery_at),
    supersededContinuationId: job.queue_superseded_continuation_id == null
      ? null
      : String(job.queue_superseded_continuation_id),
    safetyPhase: job.queue_safety_phase == null
      ? null
      : String(job.queue_safety_phase),
    safetyPublishedAt: job.queue_safety_published_at == null
      ? null
      : String(job.queue_safety_published_at),
    safetyConsumedAt: job.queue_safety_consumed_at == null
      ? null
      : String(job.queue_safety_consumed_at),
    safetyPublishCount: Number(job.queue_safety_publish_count ?? 0),
    safetyConsumeCount: Number(job.queue_safety_consume_count ?? 0),
    recoveryLeaseUntil,
    heartbeatAgeSeconds,
    publishedAgeSeconds,
    consumerAlive,
    waitingForConsumer,
    orphanedPublished,
    stalledConsumer,
    needsBootstrap,
    bulkStartedAt: job.bulk_started_at == null
      ? null
      : String(job.bulk_started_at),
  };
}

export async function readDevelopmentUpdateStatus() {
  // M8.10.22 Unified Progress + Durable Queue Source of Truth:
  // one singleton-pointer JOIN supplies the active job header AND pipeline state.
  // The live UI no longer performs an independent getCloudStatus/readPipelineState
  // lookup that can fail or drift to a different snapshot.
  const db = await database({ migrate: false });
  const active = await resolveActiveDevelopmentJob(db, null, { repair: true });
  const cloud = unifiedCloudStatusFromActive(active);
  const jobId = active.jobId;
  const cloudStatus = String(cloud.status ?? "");
  const remaining = Number(cloud.remaining ?? 0);
  const postprocess = pipelineFromActiveJob(active.job);
  const auxiliaryWarnings: string[] = [];
  const bulkSnapshot = active.job ? {
    status: active.job.bulk_status == null ? null : String(active.job.bulk_status),
    tradeDate: active.jobDate ? String(active.jobDate).slice(0,10) : null,
    priceSource: active.job.bulk_price_source == null ? null : String(active.job.bulk_price_source),
    institutionalSource: active.job.bulk_institutional_source == null ? null : String(active.job.bulk_institutional_source),
    priceRows: Number(active.job.bulk_price_rows ?? 0),
    institutionalRows: Number(active.job.bulk_institutional_rows ?? 0),
    accumulationRows: Number(active.job.bulk_accumulation_rows ?? 0),
    allowedSymbols: Number(active.job.bulk_allowed_symbols ?? 0),
    externalRequests: Number(active.job.bulk_external_requests ?? 0),
    finmindRequests: Number(active.job.bulk_finmind_requests ?? 0),
    officialRequests: Number(active.job.bulk_official_requests ?? 0),
    lastError: active.job.bulk_last_error == null ? null : String(active.job.bulk_last_error),
    nextRetryAt: active.job.bulk_next_retry_at == null ? null : String(active.job.bulk_next_retry_at),
  } : null;

  const queueHeartbeat = queueHeartbeatFromActive(
    active.job,
    remaining,
    bulkSnapshot?.nextRetryAt ?? null,
  );
  const postRunning = postprocess?.status === "running" && (cloudStatus === "completed" || remaining <= 0);
  const marketRunning = Boolean(jobId) && remaining > 0 && ["waiting","running","checkpointed","paused"].includes(cloudStatus);

  return {
    ...cloud,
    ...(postRunning ? {
      status: "postprocessing",
      remaining: 1,
      percentage: 100,
      current_symbol: postprocess?.stage ?? "Swing10 後處理",
    } : {}),
    developmentMode: getDevelopmentModeConfig(),
    prioritySymbols: [],
    postprocess,
    bulkSnapshot,
    queueHeartbeat,
    auxiliaryWarnings,
    statusSource: "unified_active_pointer",
    unifiedProgress: true,
    marketRunning,
    activeJobId: active.jobId,
    activeJobDate: active.jobDate,
    activeJobSource: active.source,
    activeJobHealth: active.health,
    activeJobRepairActions: active.repairActions,
    pointerJobId: active.pointerJobId,
    queueJobId: active.queueJobId,
    pipelineJobId: active.job?.pipeline_job_id == null ? null : String(active.job.pipeline_job_id),
  };
}
