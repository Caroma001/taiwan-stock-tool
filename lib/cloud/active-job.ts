import { TursoDatabaseAdapter } from "@/adapters/turso";
import type { DatabaseRow } from "@/lib/database";

export const ACTIVE_DEVELOPMENT_JOB_KEY = "daily-update";

export type ActiveJobHealth =
  | "HEALTHY"
  | "POINTER_REPAIRED"
  | "COUNTS_REPAIRED"
  | "NO_ITEMS"
  | "INVALID_JOB"
  | "NOT_STARTED";

export type ActiveJobResolution = {
  jobId: string | null;
  jobDate: string;
  source: "active_pointer" | "job_date_repair" | "none";
  health: ActiveJobHealth;
  repaired: boolean;
  repairActions: string[];
  pointerJobId: string | null;
  queueJobId: string | null;
  queueMessageId: string | null;
  job: DatabaseRow | null;
};

function stringValue(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

export async function persistActiveDevelopmentJob(
  db: TursoDatabaseAdapter,
  jobId: string,
  jobDate: string,
  source = "explicit",
) {
  const now = new Date().toISOString();
  try {
    await db.execute({
      sql: `INSERT INTO active_development_job(singleton_key,job_id,job_date,updated_at,source)
        VALUES(?,?,?,?,?)
        ON CONFLICT(singleton_key) DO UPDATE SET
          queue_job_id=CASE WHEN active_development_job.job_id<>excluded.job_id THEN NULL ELSE active_development_job.queue_job_id END,
          queue_message_id=CASE WHEN active_development_job.job_id<>excluded.job_id THEN NULL ELSE active_development_job.queue_message_id END,
          job_id=excluded.job_id,
          job_date=excluded.job_date,
          updated_at=excluded.updated_at,
          source=excluded.source`,
      args: [ACTIVE_DEVELOPMENT_JOB_KEY, jobId, jobDate, now, source],
    });
  } catch {
    // Backward-compatible first request after deployment: migration 29 may not
    // have run yet, but migration 28's four-column pointer can still be repaired.
    await db.execute({
      sql: `INSERT INTO active_development_job(singleton_key,job_id,job_date,updated_at)
        VALUES(?,?,?,?)
        ON CONFLICT(singleton_key) DO UPDATE SET
          job_id=excluded.job_id,job_date=excluded.job_date,updated_at=excluded.updated_at`,
      args: [ACTIVE_DEVELOPMENT_JOB_KEY, jobId, jobDate, now],
    });
  }
}

export async function recordPublishedQueueJob(
  db: TursoDatabaseAdapter,
  jobId: string,
  messageId: string | null,
) {
  await db.execute({
    sql: `UPDATE active_development_job
      SET queue_job_id=?,queue_message_id=?,updated_at=?
      WHERE singleton_key=?`,
    args: [jobId, messageId, new Date().toISOString(), ACTIVE_DEVELOPMENT_JOB_KEY],
  });
}

/**
 * Cheap hot-path resolver.
 * Normal status polling reads one singleton-pointer row joined to its job header
 * and the same job's pipeline identity. It never scans cloud_update_items.
 */
export async function resolveActiveDevelopmentJob(
  db: TursoDatabaseAdapter,
  expectedJobDate?: string | null,
  options: { repair?: boolean } = {},
): Promise<ActiveJobResolution> {
  const repair = options.repair !== false;
  const repairActions: string[] = [];

  const pointerQuery = {
    sql: `SELECT a.job_id AS pointer_job_id,a.job_date AS pointer_job_date,
      a.queue_job_id,a.queue_message_id,
      q.state AS queue_runtime_state,q.generation AS queue_generation,
      q.continuation_id AS queue_continuation_id,
      q.predecessor_continuation_id AS queue_predecessor_continuation_id,
      q.message_id AS queue_runtime_message_id,q.source AS queue_runtime_source,
      q.expected_processed AS queue_expected_processed,q.phase AS queue_phase,
      q.published_at AS queue_published_at,
      q.consumed_continuation_id AS queue_consumed_continuation_id,
      q.consumed_at AS queue_consumed_at,
      q.heartbeat_continuation_id AS queue_heartbeat_continuation_id,
      q.heartbeat_at AS queue_heartbeat_at,q.completed_at AS queue_completed_at,
      q.last_error AS queue_runtime_last_error,q.publish_count AS queue_publish_count,
      q.consume_count AS queue_consume_count,q.recovery_count AS queue_recovery_count,
      q.last_recovery_reason AS queue_last_recovery_reason,q.last_recovery_at AS queue_last_recovery_at,
      q.superseded_continuation_id AS queue_superseded_continuation_id,
      q.safety_continuation_id AS queue_safety_continuation_id,
      q.safety_message_id AS queue_safety_message_id,
      q.safety_watch_continuation_id AS queue_safety_watch_continuation_id,
      q.safety_watch_generation AS queue_safety_watch_generation,
      q.safety_published_at AS queue_safety_published_at,
      q.safety_consumed_at AS queue_safety_consumed_at,
      q.safety_phase AS queue_safety_phase,q.safety_last_checked_at AS queue_safety_last_checked_at,
      q.safety_publish_count AS queue_safety_publish_count,q.safety_consume_count AS queue_safety_consume_count,
      q.recovery_lease_until AS queue_recovery_lease_until,
      j.*,
      p.job_id AS pipeline_job_id,p.status AS pipeline_status,p.stage AS pipeline_stage,
      p.candidate_count AS pipeline_candidate_count,p.chip_success AS pipeline_chip_success,
      p.chip_failed AS pipeline_chip_failed,p.breakout_scored AS pipeline_breakout_scored,
      p.stealth_scored AS pipeline_stealth_scored,p.radar_failed AS pipeline_radar_failed,
      p.last_error AS pipeline_last_error,p.started_at AS pipeline_started_at,
      p.updated_at AS pipeline_updated_at,p.completed_at AS pipeline_completed_at,
      b.status AS bulk_status,b.price_source AS bulk_price_source,b.institutional_source AS bulk_institutional_source,
      b.price_rows AS bulk_price_rows,b.institutional_rows AS bulk_institutional_rows,b.accumulation_rows AS bulk_accumulation_rows,
      b.allowed_symbols AS bulk_allowed_symbols,b.external_requests AS bulk_external_requests,
      b.finmind_requests AS bulk_finmind_requests,b.official_requests AS bulk_official_requests,
      b.last_error AS bulk_last_error,b.next_retry_at AS bulk_next_retry_at,b.started_at AS bulk_started_at,b.updated_at AS bulk_updated_at
      FROM active_development_job a
      LEFT JOIN cloud_update_jobs j ON j.id=a.job_id
      LEFT JOIN daily_queue_runtime q ON q.job_id=a.job_id
      LEFT JOIN daily_update_pipeline_state p ON p.job_id=a.job_id
      LEFT JOIN daily_bulk_snapshot_runs b ON b.trade_date=substr(j.job_date,1,10)
      WHERE a.singleton_key=? LIMIT 1`,
    args: [ACTIVE_DEVELOPMENT_JOB_KEY],
  };
  let pointer;
  try {
    pointer = await db.execute<DatabaseRow>(pointerQuery);
  } catch {
    // A fresh deployment can receive a status read a few milliseconds before
    // migration 30 has run. Fall back to the same singleton JOIN without bulk
    // telemetry instead of collapsing the UI to 0/0.
    pointer = await db.execute<DatabaseRow>({
      sql: `SELECT a.job_id AS pointer_job_id,a.job_date AS pointer_job_date,
        a.queue_job_id,a.queue_message_id,j.*,
        p.job_id AS pipeline_job_id,p.status AS pipeline_status,p.stage AS pipeline_stage,
        p.candidate_count AS pipeline_candidate_count,p.chip_success AS pipeline_chip_success,
        p.chip_failed AS pipeline_chip_failed,p.breakout_scored AS pipeline_breakout_scored,
        p.stealth_scored AS pipeline_stealth_scored,p.radar_failed AS pipeline_radar_failed,
        p.last_error AS pipeline_last_error,p.started_at AS pipeline_started_at,
        p.updated_at AS pipeline_updated_at,p.completed_at AS pipeline_completed_at
        FROM active_development_job a
        LEFT JOIN cloud_update_jobs j ON j.id=a.job_id
        LEFT JOIN daily_update_pipeline_state p ON p.job_id=a.job_id
        WHERE a.singleton_key=? LIMIT 1`,
      args: [ACTIVE_DEVELOPMENT_JOB_KEY],
    }).catch(() => ({ rows: [] as readonly DatabaseRow[], rowsAffected: 0 }));
  }

  const row = pointer.rows[0];
  const pointerJobId = stringValue(row?.pointer_job_id);
  const queueJobId = stringValue(row?.queue_job_id);
  const queueMessageId = stringValue(row?.queue_message_id);
  const pointerIsCurrent = Boolean(
    row &&
    pointerJobId &&
    (!expectedJobDate || String(row.pointer_job_date ?? "") === expectedJobDate) &&
    String(row.id ?? "") === pointerJobId,
  );

  if (pointerIsCurrent) {
    return {
      jobId: pointerJobId,
      jobDate: String(row?.pointer_job_date ?? expectedJobDate ?? ""),
      source: "active_pointer",
      health: "HEALTHY",
      repaired: false,
      repairActions,
      pointerJobId,
      queueJobId,
      queueMessageId,
      job: row,
    };
  }

  // Pointer is absent/stale/broken. Only a caller that knows the expected
  // effective trading date may repair it against the unique job_date. Hot-path
  // status/worker reads with no expected date never guess another job.
  if (!expectedJobDate) {
    return {
      jobId: null,
      jobDate: "",
      source: "none",
      health: pointerJobId ? "INVALID_JOB" : "NOT_STARTED",
      repaired: false,
      repairActions,
      pointerJobId,
      queueJobId,
      queueMessageId,
      job: null,
    };
  }

  const dated = await db.execute<DatabaseRow>({
    sql: "SELECT * FROM cloud_update_jobs WHERE job_date=? LIMIT 1",
    args: [expectedJobDate],
  });
  const job = dated.rows[0] ?? null;
  if (!job) {
    return {
      jobId: null,
      jobDate: expectedJobDate,
      source: "none",
      health: pointerJobId ? "INVALID_JOB" : "NOT_STARTED",
      repaired: false,
      repairActions,
      pointerJobId,
      queueJobId,
      queueMessageId,
      job: null,
    };
  }

  const jobId = String(job.id);
  if (repair) {
    await persistActiveDevelopmentJob(db, jobId, expectedJobDate, "job_date_repair");
    await db.execute({
      sql: "UPDATE active_development_job SET repaired_at=? WHERE singleton_key=?",
      args: [new Date().toISOString(), ACTIVE_DEVELOPMENT_JOB_KEY],
    }).catch(() => undefined);
    repairActions.push(`active pointer ${pointerJobId ?? "null"} -> ${jobId}`);
  }

  return {
    jobId,
    jobDate: expectedJobDate,
    source: "job_date_repair",
    health: repair ? "POINTER_REPAIRED" : "INVALID_JOB",
    repaired: repair,
    repairActions,
    pointerJobId: repair ? jobId : pointerJobId,
    queueJobId,
    queueMessageId,
    job,
  };
}

async function inspectAndRepairCounters(
  db: TursoDatabaseAdapter,
  job: DatabaseRow,
): Promise<{ actions: string[]; hasItems: boolean }> {
  const jobId = String(job.id ?? "");
  const total = Number(job.total_symbols ?? 0);
  const processed = Number(job.processed_symbols ?? 0);
  const probe = await db.execute<DatabaseRow>({
    sql: "SELECT symbol FROM cloud_update_items WHERE job_id=? LIMIT 1",
    args: [jobId],
  });
  const hasItems = Boolean(probe.rows[0]);
  if (!hasItems) return { actions: [], hasItems: false };

  // Expensive aggregate is used only if the compact summary is impossible.
  if (total > 0 && processed >= 0 && processed <= total) return { actions: [], hasItems: true };

  const counts = await db.execute<DatabaseRow>({
    sql: `SELECT
      COUNT(*) AS item_count,
      SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed_count,
      SUM(CASE WHEN status='skipped' THEN 1 ELSE 0 END) AS skipped_count,
      SUM(CASE WHEN status='failed' AND attempts>=4 THEN 1 ELSE 0 END) AS failed_count
      FROM cloud_update_items WHERE job_id=?`,
    args: [jobId],
  });
  const countRow = counts.rows[0] ?? {};
  const itemCount = Number(countRow.item_count ?? 0);
  const completed = Number(countRow.completed_count ?? 0);
  const skipped = Number(countRow.skipped_count ?? 0);
  const failed = Number(countRow.failed_count ?? 0);
  const repairedProcessed = completed + skipped + failed;
  const actions: string[] = [];
  if (total !== itemCount) actions.push(`total_symbols ${total} -> ${itemCount}`);
  if (processed !== repairedProcessed) actions.push(`processed_symbols ${processed} -> ${repairedProcessed}`);

  if (actions.length) {
    await db.execute({
      sql: `UPDATE cloud_update_jobs SET
        total_symbols=?,processed_symbols=?,success_symbols=?,failed_symbols=?,skipped_symbols=?,updated_at=?
        WHERE id=?`,
      args: [itemCount, repairedProcessed, completed, failed, skipped, new Date().toISOString(), jobId],
    });
  }
  return { actions, hasItems: true };
}

/** Diagnostics-only: may perform a few extra small reads. */
export async function getActiveJobDiagnostics(
  db: TursoDatabaseAdapter,
  expectedJobDate: string,
) {
  const resolved = await resolveActiveDevelopmentJob(db, expectedJobDate, { repair: true });
  let job = resolved.job;
  if (!job || !resolved.jobId) {
    return {
      ok: true,
      version: "M8.10.22",
      health: resolved.health,
      repaired: resolved.repaired,
      repairActions: resolved.repairActions,
      activeJobId: null,
      jobDate: expectedJobDate,
      jobStatus: "not_started",
      totalSymbols: 0,
      processedSymbols: 0,
      hasCloudUpdateItems: false,
      pipelineJobId: null,
      queueJobId: resolved.queueJobId,
      queueMessageId: resolved.queueMessageId,
      queueRuntimeState: resolved.job?.queue_runtime_state == null ? null : String(resolved.job.queue_runtime_state),
      queueGeneration: Number(resolved.job?.queue_generation ?? 1),
      queueContinuationId: resolved.job?.queue_continuation_id == null ? null : String(resolved.job.queue_continuation_id),
      queueConsumedContinuationId: resolved.job?.queue_consumed_continuation_id == null ? null : String(resolved.job.queue_consumed_continuation_id),
      queueHeartbeatContinuationId: resolved.job?.queue_heartbeat_continuation_id == null ? null : String(resolved.job.queue_heartbeat_continuation_id),
      queueRecoveryCount: Number(resolved.job?.queue_recovery_count ?? 0),
      queueLastRecoveryReason: resolved.job?.queue_last_recovery_reason == null ? null : String(resolved.job.queue_last_recovery_reason),
      queuePublishedAt: resolved.job?.queue_published_at == null ? null : String(resolved.job.queue_published_at),
      queueConsumedAt: resolved.job?.queue_consumed_at == null ? null : String(resolved.job.queue_consumed_at),
      queueHeartbeatAt: resolved.job?.queue_heartbeat_at == null ? null : String(resolved.job.queue_heartbeat_at),
      queuePhase: resolved.job?.queue_phase == null ? null : String(resolved.job.queue_phase),
      queuePublishCount: Number(resolved.job?.queue_publish_count ?? 0),
      queueConsumeCount: Number(resolved.job?.queue_consume_count ?? 0),
      queueSafetyPublishedAt: resolved.job?.queue_safety_published_at == null ? null : String(resolved.job.queue_safety_published_at),
      bulkStartedAt: resolved.job?.bulk_started_at == null ? null : String(resolved.job.bulk_started_at),
      pointerJobId: resolved.pointerJobId,
      source: resolved.source,
      allMatch: !resolved.pointerJobId && !resolved.queueJobId,
      updatedAt: null,
    };
  }

  const counter = await inspectAndRepairCounters(db, job);
  if (counter.actions.length) {
    const refreshed = await db.execute<DatabaseRow>({
      sql: "SELECT * FROM cloud_update_jobs WHERE id=? LIMIT 1",
      args: [resolved.jobId],
    });
    job = refreshed.rows[0] ? ({ ...job, ...refreshed.rows[0] } as DatabaseRow) : job;
  }

  // M8.10.20: pipeline identity and bulk telemetry are joined into the active-pointer read.
  // Diagnostics and the live status UI now see the same job/pipeline row,
  // avoiding a second query that could drift or fail independently.
  const pipelineJobId = stringValue(job.pipeline_job_id);

  const comparable = [resolved.pointerJobId, resolved.queueJobId, pipelineJobId].filter(Boolean);
  const allMatch = comparable.every((id) => id === resolved.jobId);
  const repairActions = [...resolved.repairActions, ...counter.actions];
  let health: ActiveJobHealth = "HEALTHY";
  if (!counter.hasItems || Number(job.total_symbols ?? 0) <= 0) health = "NO_ITEMS";
  else if (resolved.health === "POINTER_REPAIRED") health = "POINTER_REPAIRED";
  else if (counter.actions.length) health = "COUNTS_REPAIRED";
  else if (!allMatch) health = "INVALID_JOB";

  return {
    ok: true,
    version: "M8.10.22",
    health,
    repaired: repairActions.length > 0,
    repairActions,
    activeJobId: resolved.jobId,
    jobDate: expectedJobDate,
    jobStatus: String(job.status ?? "unknown"),
    totalSymbols: Number(job.total_symbols ?? 0),
    processedSymbols: Number(job.processed_symbols ?? 0),
    hasCloudUpdateItems: counter.hasItems,
    pipelineJobId,
    queueJobId: resolved.queueJobId,
    queueMessageId: resolved.queueMessageId,
    queueRuntimeState: job.queue_runtime_state == null ? null : String(job.queue_runtime_state),
    queueGeneration: Number(job.queue_generation ?? 1),
    queueContinuationId: job.queue_continuation_id == null ? null : String(job.queue_continuation_id),
    queueConsumedContinuationId: job.queue_consumed_continuation_id == null ? null : String(job.queue_consumed_continuation_id),
    queueHeartbeatContinuationId: job.queue_heartbeat_continuation_id == null ? null : String(job.queue_heartbeat_continuation_id),
    queueRecoveryCount: Number(job.queue_recovery_count ?? 0),
    queueLastRecoveryReason: job.queue_last_recovery_reason == null ? null : String(job.queue_last_recovery_reason),
    queuePublishedAt: job.queue_published_at == null ? null : String(job.queue_published_at),
    queueConsumedAt: job.queue_consumed_at == null ? null : String(job.queue_consumed_at),
    queueHeartbeatAt: job.queue_heartbeat_at == null ? null : String(job.queue_heartbeat_at),
    queuePhase: job.queue_phase == null ? null : String(job.queue_phase),
    queuePublishCount: Number(job.queue_publish_count ?? 0),
    queueConsumeCount: Number(job.queue_consume_count ?? 0),
    queueSafetyPublishedAt: job.queue_safety_published_at == null ? null : String(job.queue_safety_published_at),
    bulkStartedAt: job.bulk_started_at == null ? null : String(job.bulk_started_at),
    pointerJobId: resolved.pointerJobId,
    source: resolved.source,
    allMatch,
    bulkStatus: job.bulk_status == null ? null : String(job.bulk_status),
    bulkPriceSource: job.bulk_price_source == null ? null : String(job.bulk_price_source),
    bulkInstitutionalSource: job.bulk_institutional_source == null ? null : String(job.bulk_institutional_source),
    bulkPriceRows: Number(job.bulk_price_rows ?? 0),
    bulkInstitutionalRows: Number(job.bulk_institutional_rows ?? 0),
    bulkAccumulationRows: Number(job.bulk_accumulation_rows ?? 0),
    bulkAllowedSymbols: Number(job.bulk_allowed_symbols ?? 0),
    bulkExternalRequests: Number(job.bulk_external_requests ?? 0),
    bulkFinMindRequests: Number(job.bulk_finmind_requests ?? 0),
    bulkOfficialRequests: Number(job.bulk_official_requests ?? 0),
    bulkLastError: job.bulk_last_error == null ? null : String(job.bulk_last_error),
    bulkNextRetryAt: job.bulk_next_retry_at == null ? null : String(job.bulk_next_retry_at),
    updatedAt: job.updated_at == null ? null : String(job.updated_at),
  };
}
