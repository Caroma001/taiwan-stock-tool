import { randomUUID } from "node:crypto";
import type { DatabaseAdapter, DatabaseRow } from "@/lib/database";

export type QueueRole = "work" | "safety";

export type QueueRuntimeSnapshot = {
  jobId: string;
  state: string;
  generation: number;
  continuationId: string | null;
  predecessorContinuationId: string | null;
  messageId: string | null;
  source: string | null;
  expectedProcessed: number;
  phase: string | null;
  publishedAt: string | null;
  consumedContinuationId: string | null;
  consumedAt: string | null;
  heartbeatContinuationId: string | null;
  heartbeatAt: string | null;
  completedAt: string | null;
  lastError: string | null;
  publishCount: number;
  consumeCount: number;
  recoveryCount: number;
  lastRecoveryReason: string | null;
  lastRecoveryAt: string | null;
  supersededContinuationId: string | null;
  safetyContinuationId: string | null;
  safetyMessageId: string | null;
  safetyWatchContinuationId: string | null;
  safetyWatchGeneration: number | null;
  safetyPublishedAt: string | null;
  safetyConsumedAt: string | null;
  safetyPhase: string | null;
  safetyLastCheckedAt: string | null;
  safetyPublishCount: number;
  safetyConsumeCount: number;
  recoveryToken: string | null;
  recoveryLeaseUntil: string | null;
  updatedAt: string | null;
};

export type WorkConsumeClaim = {
  accepted: boolean;
  reason:
    | "accepted"
    | "stale_generation"
    | "stale_continuation"
    | "recovery_in_progress"
    | "duplicate_alive";
  runtime: QueueRuntimeSnapshot | null;
};

export type RecoveryLease = {
  claimed: boolean;
  token: string | null;
  leaseUntil: string | null;
  currentGeneration: number;
  nextGeneration: number;
  currentContinuationId: string | null;
};

let schemaReady = false;

export async function ensureQueueRuntimeSchema(db: DatabaseAdapter) {
  if (schemaReady) return;
  // Full latest shape for a new database. Existing databases are upgraded by
  // migration 0032.
  await db.execute({ sql: `CREATE TABLE IF NOT EXISTS daily_queue_runtime (
    job_id TEXT PRIMARY KEY,
    state TEXT NOT NULL DEFAULT 'idle',
    generation INTEGER NOT NULL DEFAULT 1,
    continuation_id TEXT,
    predecessor_continuation_id TEXT,
    message_id TEXT,
    source TEXT,
    expected_processed INTEGER NOT NULL DEFAULT 0,
    phase TEXT,
    published_at TEXT,
    consumed_continuation_id TEXT,
    consumed_at TEXT,
    heartbeat_continuation_id TEXT,
    heartbeat_at TEXT,
    completed_at TEXT,
    last_error TEXT,
    publish_count INTEGER NOT NULL DEFAULT 0,
    consume_count INTEGER NOT NULL DEFAULT 0,
    recovery_count INTEGER NOT NULL DEFAULT 0,
    last_recovery_reason TEXT,
    last_recovery_at TEXT,
    superseded_continuation_id TEXT,
    safety_continuation_id TEXT,
    safety_message_id TEXT,
    safety_watch_continuation_id TEXT,
    safety_watch_generation INTEGER,
    safety_published_at TEXT,
    safety_consumed_at TEXT,
    safety_phase TEXT,
    safety_last_checked_at TEXT,
    safety_publish_count INTEGER NOT NULL DEFAULT 0,
    safety_consume_count INTEGER NOT NULL DEFAULT 0,
    recovery_token TEXT,
    recovery_lease_until TEXT,
    updated_at TEXT NOT NULL
  )` });
  schemaReady = true;
}

function text(value: unknown): string | null {
  const valueText = String(value ?? "").trim();
  return valueText || null;
}

function fromRow(row: DatabaseRow | undefined): QueueRuntimeSnapshot | null {
  if (!row) return null;
  return {
    jobId: String(row.job_id ?? ""),
    state: String(row.state ?? "idle"),
    generation: Math.max(1, Number(row.generation ?? 1)),
    continuationId: text(row.continuation_id),
    predecessorContinuationId: text(row.predecessor_continuation_id),
    messageId: text(row.message_id),
    source: text(row.source),
    expectedProcessed: Number(row.expected_processed ?? 0),
    phase: text(row.phase),
    publishedAt: text(row.published_at),
    consumedContinuationId: text(row.consumed_continuation_id),
    consumedAt: text(row.consumed_at),
    heartbeatContinuationId: text(row.heartbeat_continuation_id),
    heartbeatAt: text(row.heartbeat_at),
    completedAt: text(row.completed_at),
    lastError: text(row.last_error),
    publishCount: Number(row.publish_count ?? 0),
    consumeCount: Number(row.consume_count ?? 0),
    recoveryCount: Number(row.recovery_count ?? 0),
    lastRecoveryReason: text(row.last_recovery_reason),
    lastRecoveryAt: text(row.last_recovery_at),
    supersededContinuationId: text(row.superseded_continuation_id),
    safetyContinuationId: text(row.safety_continuation_id),
    safetyMessageId: text(row.safety_message_id),
    safetyWatchContinuationId: text(row.safety_watch_continuation_id),
    safetyWatchGeneration: row.safety_watch_generation == null
      ? null
      : Number(row.safety_watch_generation),
    safetyPublishedAt: text(row.safety_published_at),
    safetyConsumedAt: text(row.safety_consumed_at),
    safetyPhase: text(row.safety_phase),
    safetyLastCheckedAt: text(row.safety_last_checked_at),
    safetyPublishCount: Number(row.safety_publish_count ?? 0),
    safetyConsumeCount: Number(row.safety_consume_count ?? 0),
    recoveryToken: text(row.recovery_token),
    recoveryLeaseUntil: text(row.recovery_lease_until),
    updatedAt: text(row.updated_at),
  };
}

export async function readQueueRuntime(db: DatabaseAdapter, jobId: string) {
  await ensureQueueRuntimeSchema(db);
  const result = await db.execute<DatabaseRow>({
    sql: "SELECT * FROM daily_queue_runtime WHERE job_id=? LIMIT 1",
    args: [jobId],
  });
  return fromRow(result.rows[0]);
}

export async function recordQueuePublished(
  db: DatabaseAdapter,
  input: {
    jobId: string;
    role: QueueRole;
    continuationId: string;
    messageId: string | null;
    source: string;
    expectedProcessed: number;
    generation: number;
    predecessorContinuationId?: string | null;
    watchContinuationId?: string | null;
    watchGeneration?: number | null;
    recoveryReason?: string | null;
  },
) {
  await ensureQueueRuntimeSchema(db);
  const now = new Date().toISOString();
  const generation = Math.max(1, Math.floor(input.generation || 1));

  if (input.role === "safety") {
    await db.execute({
      sql: `INSERT INTO daily_queue_runtime(
        job_id,state,generation,safety_continuation_id,safety_message_id,
        safety_watch_continuation_id,safety_watch_generation,safety_published_at,
        safety_publish_count,publish_count,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,1,1,?)
      ON CONFLICT(job_id) DO UPDATE SET
        safety_continuation_id=excluded.safety_continuation_id,
        safety_message_id=excluded.safety_message_id,
        safety_watch_continuation_id=excluded.safety_watch_continuation_id,
        safety_watch_generation=excluded.safety_watch_generation,
        safety_published_at=excluded.safety_published_at,
        safety_publish_count=daily_queue_runtime.safety_publish_count+1,
        publish_count=daily_queue_runtime.publish_count+1,
        updated_at=excluded.updated_at`,
      args: [
        input.jobId,
        "idle",
        generation,
        input.continuationId,
        input.messageId,
        input.watchContinuationId ?? null,
        input.watchGeneration ?? generation,
        now,
        now,
      ],
    });
    return;
  }

  await db.execute({
    sql: `INSERT INTO daily_queue_runtime(
      job_id,state,generation,continuation_id,predecessor_continuation_id,
      message_id,source,expected_processed,phase,published_at,
      publish_count,recovery_count,last_recovery_reason,last_recovery_at,
      superseded_continuation_id,recovery_token,recovery_lease_until,updated_at,last_error
    ) VALUES(?,?,?,?,?,?,?,?,?,?,1,0,?,?,?,NULL,NULL,?,NULL)
    ON CONFLICT(job_id) DO UPDATE SET
      state='published',
      generation=excluded.generation,
      continuation_id=excluded.continuation_id,
      predecessor_continuation_id=excluded.predecessor_continuation_id,
      message_id=excluded.message_id,
      source=excluded.source,
      expected_processed=excluded.expected_processed,
      phase=CASE WHEN excluded.generation>daily_queue_runtime.generation
        THEN 'Recovery continuation 已發布'
        ELSE '等待 Queue Consumer'
      END,
      published_at=excluded.published_at,
      publish_count=daily_queue_runtime.publish_count+1,
      recovery_count=daily_queue_runtime.recovery_count
        + CASE WHEN excluded.generation>daily_queue_runtime.generation THEN 1 ELSE 0 END,
      last_recovery_reason=CASE WHEN excluded.generation>daily_queue_runtime.generation
        THEN COALESCE(excluded.last_recovery_reason,daily_queue_runtime.last_recovery_reason)
        ELSE daily_queue_runtime.last_recovery_reason
      END,
      last_recovery_at=CASE WHEN excluded.generation>daily_queue_runtime.generation
        THEN excluded.last_recovery_at ELSE daily_queue_runtime.last_recovery_at END,
      superseded_continuation_id=CASE WHEN excluded.generation>daily_queue_runtime.generation
        THEN excluded.superseded_continuation_id ELSE daily_queue_runtime.superseded_continuation_id END,
      recovery_token=NULL,
      recovery_lease_until=NULL,
      updated_at=excluded.updated_at,
      last_error=NULL`,
    args: [
      input.jobId,
      "published",
      generation,
      input.continuationId,
      input.predecessorContinuationId ?? null,
      input.messageId,
      input.source,
      Math.max(0, Number(input.expectedProcessed ?? 0)),
      "等待 Queue Consumer",
      now,
      input.recoveryReason ?? null,
      input.recoveryReason ? now : null,
      input.recoveryReason ? (input.predecessorContinuationId ?? null) : null,
      now,
    ],
  });
}

export async function claimWorkMessage(
  db: DatabaseAdapter,
  input: {
    jobId: string;
    continuationId: string;
    generation: number;
    source: string;
    expectedProcessed: number;
    recovery?: boolean;
  },
): Promise<WorkConsumeClaim> {
  await ensureQueueRuntimeSchema(db);
  const now = new Date();
  const nowIso = now.toISOString();
  const aliveCutoff = new Date(now.getTime() - 120_000).toISOString();
  const generation = Math.max(1, Math.floor(input.generation || 1));

  const claim = await db.execute({
    sql: `UPDATE daily_queue_runtime SET
      state=?,
      source=?,
      expected_processed=?,
      phase=?,
      consumed_continuation_id=?,
      consumed_at=?,
      heartbeat_continuation_id=?,
      heartbeat_at=?,
      consume_count=consume_count+1,
      recovery_token=NULL,
      recovery_lease_until=NULL,
      updated_at=?,
      last_error=NULL
      WHERE job_id=?
        AND generation=?
        AND continuation_id=?
        AND state<>'recovery_claimed'
        AND NOT (
          consumed_continuation_id=?
          AND state IN ('consuming','processing','recovery_consuming')
          AND heartbeat_continuation_id=?
          AND heartbeat_at IS NOT NULL
          AND heartbeat_at>?
        )`,
    args: [
      input.recovery ? "recovery_consuming" : "consuming",
      input.source,
      Math.max(0, Number(input.expectedProcessed ?? 0)),
      input.recovery ? "Recovery Consumer 已啟動" : "Queue Consumer 已啟動",
      input.continuationId,
      nowIso,
      input.continuationId,
      nowIso,
      nowIso,
      input.jobId,
      generation,
      input.continuationId,
      input.continuationId,
      input.continuationId,
      aliveCutoff,
    ],
  });

  if (claim.rowsAffected > 0) {
    return {
      accepted: true,
      reason: "accepted",
      runtime: await readQueueRuntime(db, input.jobId),
    };
  }

  const runtime = await readQueueRuntime(db, input.jobId);
  if (!runtime) {
    return { accepted: false, reason: "stale_continuation", runtime: null };
  }
  if (runtime.generation !== generation) {
    return { accepted: false, reason: "stale_generation", runtime };
  }
  if (runtime.continuationId !== input.continuationId) {
    return { accepted: false, reason: "stale_continuation", runtime };
  }
  if (runtime.state === "recovery_claimed") {
    return { accepted: false, reason: "recovery_in_progress", runtime };
  }
  return { accepted: false, reason: "duplicate_alive", runtime };
}

export async function recordQueueHeartbeat(
  db: DatabaseAdapter,
  input: {
    jobId: string;
    continuationId: string;
    generation: number;
    phase: string;
    expectedProcessed?: number;
  },
) {
  await ensureQueueRuntimeSchema(db);
  const now = new Date().toISOString();
  const result = await db.execute({
    sql: `UPDATE daily_queue_runtime SET
      state=CASE WHEN state='recovery_consuming' THEN 'recovery_consuming' ELSE 'processing' END,
      phase=?,
      heartbeat_continuation_id=?,
      heartbeat_at=?,
      updated_at=?,
      expected_processed=CASE WHEN ? IS NULL THEN expected_processed ELSE ? END,
      last_error=NULL
      WHERE job_id=? AND generation=? AND continuation_id=?`,
    args: [
      input.phase,
      input.continuationId,
      now,
      now,
      input.expectedProcessed == null ? null : input.expectedProcessed,
      input.expectedProcessed == null ? null : input.expectedProcessed,
      input.jobId,
      Math.max(1, Math.floor(input.generation || 1)),
      input.continuationId,
    ],
  });
  return result.rowsAffected > 0;
}

export async function recordSafetyObservation(
  db: DatabaseAdapter,
  input: {
    jobId: string;
    safetyContinuationId: string;
    watchContinuationId: string | null;
    watchGeneration: number;
    phase: string;
  },
) {
  await ensureQueueRuntimeSchema(db);
  const now = new Date().toISOString();
  await db.execute({
    sql: `UPDATE daily_queue_runtime SET
      safety_continuation_id=?,
      safety_watch_continuation_id=?,
      safety_watch_generation=?,
      safety_consumed_at=?,
      safety_last_checked_at=?,
      safety_phase=?,
      safety_consume_count=safety_consume_count+1,
      updated_at=?
      WHERE job_id=?`,
    args: [
      input.safetyContinuationId,
      input.watchContinuationId,
      Math.max(1, Math.floor(input.watchGeneration || 1)),
      now,
      now,
      input.phase,
      now,
      input.jobId,
    ],
  });
}

export async function recordQueueCompleted(
  db: DatabaseAdapter,
  input: {
    jobId: string;
    continuationId: string;
    generation: number;
    phase?: string;
  },
) {
  await ensureQueueRuntimeSchema(db);
  const now = new Date().toISOString();
  const result = await db.execute({
    sql: `UPDATE daily_queue_runtime SET
      state='completed',
      phase=?,
      heartbeat_continuation_id=?,
      heartbeat_at=?,
      completed_at=?,
      updated_at=?,
      recovery_token=NULL,
      recovery_lease_until=NULL,
      last_error=NULL
      WHERE job_id=? AND generation=? AND continuation_id=?`,
    args: [
      input.phase ?? "全部完成",
      input.continuationId,
      now,
      now,
      now,
      input.jobId,
      Math.max(1, Math.floor(input.generation || 1)),
      input.continuationId,
    ],
  });
  return result.rowsAffected > 0;
}

export async function recordQueueError(
  db: DatabaseAdapter,
  input: {
    jobId: string;
    continuationId: string;
    generation: number;
    error: unknown;
  },
) {
  await ensureQueueRuntimeSchema(db);
  const now = new Date().toISOString();
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  await db.execute({
    sql: `UPDATE daily_queue_runtime SET
      state='error',
      phase='Queue callback error',
      heartbeat_continuation_id=?,
      heartbeat_at=?,
      last_error=?,
      updated_at=?
      WHERE job_id=? AND generation=? AND continuation_id=?`,
    args: [
      input.continuationId,
      now,
      message.slice(0, 900),
      now,
      input.jobId,
      Math.max(1, Math.floor(input.generation || 1)),
      input.continuationId,
    ],
  }).catch(() => undefined);
}

/**
 * Atomically fence an orphan/stalled continuation before recovery publishing.
 *
 * The generation is NOT incremented here. It is incremented only after Vercel
 * accepts the recovery message and recordQueuePublished() persists the new
 * continuation. If publishing fails, releaseQueueRecoveryLease() makes the old
 * continuation recoverable again.
 */
export async function claimQueueRecoveryLease(
  db: DatabaseAdapter,
  input: {
    jobId: string;
    expectedGeneration: number;
    expectedContinuationId: string | null;
    reason: string;
    ttlSeconds?: number;
  },
): Promise<RecoveryLease> {
  await ensureQueueRuntimeSchema(db);
  const now = new Date();
  const nowIso = now.toISOString();
  const ttlSeconds = Math.max(15, Math.min(120, Number(input.ttlSeconds ?? 45)));
  const token = randomUUID();
  const until = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
  const generation = Math.max(1, Math.floor(input.expectedGeneration || 1));
  const aliveCutoff = new Date(now.getTime() - 120_000).toISOString();

  await db.execute({
    sql: `INSERT OR IGNORE INTO daily_queue_runtime(
      job_id,state,generation,updated_at
    ) VALUES(?,?,?,?)`,
    args: [input.jobId, "idle", generation, nowIso],
  });

  const continuationPredicate = input.expectedContinuationId
    ? "continuation_id=?"
    : "continuation_id IS NULL";
  const args = [
    token,
    until,
    input.reason,
    input.expectedContinuationId,
    nowIso,
    nowIso,
    input.jobId,
    generation,
    ...(input.expectedContinuationId ? [input.expectedContinuationId] : []),
    nowIso,
    input.expectedContinuationId,
    input.expectedContinuationId,
    aliveCutoff,
  ];

  const claim = await db.execute({
    sql: `UPDATE daily_queue_runtime SET
      recovery_token=?,
      recovery_lease_until=?,
      state='recovery_claimed',
      phase='Durable Recovery v2 已取得 lease',
      last_recovery_reason=?,
      superseded_continuation_id=?,
      last_recovery_at=?,
      updated_at=?
      WHERE job_id=?
        AND generation=?
        AND ${continuationPredicate}
        AND (recovery_lease_until IS NULL OR recovery_lease_until<=?)
        AND NOT (
          state IN ('consuming','processing','recovery_consuming')
          AND ? IS NOT NULL
          AND heartbeat_continuation_id=?
          AND heartbeat_at IS NOT NULL
          AND heartbeat_at>?
        )`,
    args,
  });

  const current = await readQueueRuntime(db, input.jobId);
  const claimed = claim.rowsAffected > 0;

  return {
    claimed,
    token: claimed ? token : null,
    leaseUntil: claimed ? until : null,
    currentGeneration: current?.generation ?? generation,
    nextGeneration: input.expectedContinuationId ? generation + 1 : generation,
    currentContinuationId: current?.continuationId ?? input.expectedContinuationId,
  };
}

export async function releaseQueueRecoveryLease(
  db: DatabaseAdapter,
  input: {
    jobId: string;
    token: string | null;
    expectedGeneration: number;
    expectedContinuationId: string | null;
    error?: unknown;
  },
) {
  if (!input.token) return;
  await ensureQueueRuntimeSchema(db);
  const now = new Date().toISOString();
  const message = input.error == null
    ? null
    : (input.error instanceof Error ? input.error.message : String(input.error)).slice(0, 900);

  const continuationPredicate = input.expectedContinuationId
    ? "continuation_id=?"
    : "continuation_id IS NULL";
  await db.execute({
    sql: `UPDATE daily_queue_runtime SET
      recovery_token=NULL,
      recovery_lease_until=NULL,
      state=CASE WHEN ? IS NULL THEN 'published' ELSE 'error' END,
      last_error=CASE WHEN ? IS NULL THEN last_error ELSE ? END,
      updated_at=?
      WHERE job_id=?
        AND generation=?
        AND ${continuationPredicate}
        AND recovery_token=?`,
    args: [
      message,
      message,
      message,
      now,
      input.jobId,
      Math.max(1, Math.floor(input.expectedGeneration || 1)),
      ...(input.expectedContinuationId ? [input.expectedContinuationId] : []),
      input.token,
    ],
  }).catch(() => undefined);
}
