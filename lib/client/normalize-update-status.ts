export const UNIFIED_STATUS_SCHEMA_VERSION = "M8.10.22-durable-recovery-v2";

export type UnifiedPostprocess = {
  status?: string;
  stage?: string;
  candidate_count?: number;
  chip_success?: number;
  chip_failed?: number;
  breakout_scored?: number;
  stealth_scored?: number;
  radar_failed?: number;
  last_error?: string | null;
  completed_at?: string | null;
} | null;

export type UnifiedBulkSnapshot = {
  status?: string | null;
  tradeDate?: string | null;
  priceSource?: string | null;
  institutionalSource?: string | null;
  priceRows?: number;
  institutionalRows?: number;
  accumulationRows?: number;
  allowedSymbols?: number;
  externalRequests?: number;
  finmindRequests?: number;
  officialRequests?: number;
  lastError?: string | null;
  nextRetryAt?: string | null;
} | null;


export type UnifiedQueueHeartbeat = {
  state?: string;
  displayState?: string;
  generation?: number;
  continuationId?: string | null;
  predecessorContinuationId?: string | null;
  consumedContinuationId?: string | null;
  heartbeatContinuationId?: string | null;
  messageId?: string | null;
  source?: string | null;
  expectedProcessed?: number;
  phase?: string | null;
  publishedAt?: string | null;
  consumedAt?: string | null;
  heartbeatAt?: string | null;
  completedAt?: string | null;
  lastError?: string | null;
  publishCount?: number;
  consumeCount?: number;
  recoveryCount?: number;
  lastRecoveryReason?: string | null;
  lastRecoveryAt?: string | null;
  supersededContinuationId?: string | null;
  safetyPublishedAt?: string | null;
  safetyConsumedAt?: string | null;
  safetyPhase?: string | null;
  safetyPublishCount?: number;
  safetyConsumeCount?: number;
  recoveryLeaseUntil?: string | null;
  heartbeatAgeSeconds?: number | null;
  publishedAgeSeconds?: number | null;
  consumerAlive?: boolean;
  waitingForConsumer?: boolean;
  orphanedPublished?: boolean;
  stalledConsumer?: boolean;
  needsBootstrap?: boolean;
  bulkStartedAt?: string | null;
} | null;

export type UnifiedUpdateStatus = {
  ok?: boolean;
  id?: string | null;
  jobId?: string | null;
  status?: string;
  total_symbols?: number;
  processed_symbols?: number;
  success_symbols?: number;
  failed_symbols?: number;
  skipped_symbols?: number;
  current_symbol?: string | null;
  percentage?: number;
  remaining?: number;
  error?: string;
  /** Legacy UI compatibility alias; canonical error text is mirrored here. */
  last_error?: string | null;
  degraded?: boolean;
  statusSource?: string;
  statusSchemaVersion?: string;
  unifiedProgress?: boolean;
  pipelineJobId?: string | null;
  pointerJobId?: string | null;
  queueJobId?: string | null;
  activeJobId?: string | null;
  activeJobDate?: string | null;
  auxiliaryWarnings?: string[];
  prioritySymbols?: string[];
  postprocess?: UnifiedPostprocess;
  bulkSnapshot?: UnifiedBulkSnapshot;
  queueHeartbeat?: UnifiedQueueHeartbeat;
  worker?: {
    running?: boolean;
    stopRequested?: boolean;
    lastStartedAt?: string | null;
    lastError?: string | null;
  };
};

type AnyRecord = Record<string, unknown>;

function record(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as AnyRecord)
    : {};
}

function first(source: AnyRecord, keys: string[]) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return undefined;
}

function num(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const parsed = String(value).trim();
  return parsed || undefined;
}

function nullableText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const parsed = String(value).trim();
  return parsed || null;
}

function normalizePostprocess(value: unknown): UnifiedPostprocess {
  if (!value || typeof value !== "object") return null;
  const p = record(value);
  return {
    status: text(first(p, ["status"])),
    stage: text(first(p, ["stage"])),
    candidate_count: num(first(p, ["candidate_count", "candidateCount"]), 0),
    chip_success: num(first(p, ["chip_success", "chipSuccess"]), 0),
    chip_failed: num(first(p, ["chip_failed", "chipFailed"]), 0),
    breakout_scored: num(first(p, ["breakout_scored", "breakoutScored"]), 0),
    stealth_scored: num(first(p, ["stealth_scored", "stealthScored"]), 0),
    radar_failed: num(first(p, ["radar_failed", "radarFailed"]), 0),
    last_error: nullableText(first(p, ["last_error", "lastError"])),
    completed_at: nullableText(first(p, ["completed_at", "completedAt"])),
  };
}


function normalizeBulkSnapshot(value: unknown): UnifiedBulkSnapshot {
  if (!value || typeof value !== "object") return null;
  const b = record(value);
  return {
    status: nullableText(first(b,["status"])),
    tradeDate: nullableText(first(b,["tradeDate","trade_date"])),
    priceSource: nullableText(first(b,["priceSource","price_source"])),
    institutionalSource: nullableText(first(b,["institutionalSource","institutional_source"])),
    priceRows: num(first(b,["priceRows","price_rows"]),0),
    institutionalRows: num(first(b,["institutionalRows","institutional_rows"]),0),
    accumulationRows: num(first(b,["accumulationRows","accumulation_rows"]),0),
    allowedSymbols: num(first(b,["allowedSymbols","allowed_symbols"]),0),
    externalRequests: num(first(b,["externalRequests","external_requests"]),0),
    finmindRequests: num(first(b,["finmindRequests","finmind_requests"]),0),
    officialRequests: num(first(b,["officialRequests","official_requests"]),0),
    lastError: nullableText(first(b,["lastError","last_error"])),
    nextRetryAt: nullableText(first(b,["nextRetryAt","next_retry_at"])),
  };
}


function normalizeQueueHeartbeat(value: unknown): UnifiedQueueHeartbeat {
  if (!value || typeof value !== "object") return null;
  const q = record(value);
  const ageValue = first(q, ["heartbeatAgeSeconds","heartbeat_age_seconds"]);
  return {
    state: text(first(q,["state"])),
    displayState: text(first(q,["displayState","display_state"])),
    generation: num(first(q,["generation"]),1),
    continuationId: nullableText(first(q,["continuationId","continuation_id"])),
    predecessorContinuationId: nullableText(first(q,["predecessorContinuationId","predecessor_continuation_id"])),
    consumedContinuationId: nullableText(first(q,["consumedContinuationId","consumed_continuation_id"])),
    heartbeatContinuationId: nullableText(first(q,["heartbeatContinuationId","heartbeat_continuation_id"])),
    messageId: nullableText(first(q,["messageId","message_id"])),
    source: nullableText(first(q,["source"])),
    expectedProcessed: num(first(q,["expectedProcessed","expected_processed"]),0),
    phase: nullableText(first(q,["phase"])),
    publishedAt: nullableText(first(q,["publishedAt","published_at"])),
    consumedAt: nullableText(first(q,["consumedAt","consumed_at"])),
    heartbeatAt: nullableText(first(q,["heartbeatAt","heartbeat_at"])),
    completedAt: nullableText(first(q,["completedAt","completed_at"])),
    lastError: nullableText(first(q,["lastError","last_error"])),
    publishCount: num(first(q,["publishCount","publish_count"]),0),
    consumeCount: num(first(q,["consumeCount","consume_count"]),0),
    recoveryCount: num(first(q,["recoveryCount","recovery_count"]),0),
    lastRecoveryReason: nullableText(first(q,["lastRecoveryReason","last_recovery_reason"])),
    lastRecoveryAt: nullableText(first(q,["lastRecoveryAt","last_recovery_at"])),
    supersededContinuationId: nullableText(first(q,["supersededContinuationId","superseded_continuation_id"])),
    safetyPublishedAt: nullableText(first(q,["safetyPublishedAt","safety_published_at"])),
    safetyConsumedAt: nullableText(first(q,["safetyConsumedAt","safety_consumed_at"])),
    safetyPhase: nullableText(first(q,["safetyPhase","safety_phase"])),
    safetyPublishCount: num(first(q,["safetyPublishCount","safety_publish_count"]),0),
    safetyConsumeCount: num(first(q,["safetyConsumeCount","safety_consume_count"]),0),
    recoveryLeaseUntil: nullableText(first(q,["recoveryLeaseUntil","recovery_lease_until"])),
    heartbeatAgeSeconds: ageValue == null ? null : num(ageValue,0),
    publishedAgeSeconds: first(q,["publishedAgeSeconds","published_age_seconds"]) == null
      ? null
      : num(first(q,["publishedAgeSeconds","published_age_seconds"]),0),
    consumerAlive: Boolean(first(q,["consumerAlive","consumer_alive"])),
    waitingForConsumer: Boolean(first(q,["waitingForConsumer","waiting_for_consumer"])),
    orphanedPublished: Boolean(first(q,["orphanedPublished","orphaned_published"])),
    stalledConsumer: Boolean(first(q,["stalledConsumer","stalled_consumer"])),
    needsBootstrap: Boolean(first(q,["needsBootstrap","needs_bootstrap"])),
    bulkStartedAt: nullableText(first(q,["bulkStartedAt","bulk_started_at"])),
  };
}

/**
 * M8.10.22 UI binding contract.
 *
 * Every UI surface consumes this function, regardless of whether the payload
 * came from the API, localStorage, BroadcastChannel, or an older camelCase
 * caller. The returned shape is always the same snake_case progress contract.
 */
export function normalizeUnifiedUpdateStatus(input: unknown): UnifiedUpdateStatus {
  const raw = record(input);
  const nested =
    record(raw.unifiedStatus).total_symbols !== undefined ||
    record(raw.unifiedStatus).processed_symbols !== undefined
      ? record(raw.unifiedStatus)
      : record(raw.progress).total_symbols !== undefined ||
          record(raw.progress).processed_symbols !== undefined
        ? record(raw.progress)
        : {};

  const source: AnyRecord = { ...raw, ...nested };

  const total = num(first(source, [
    "total_symbols", "totalSymbols", "marketTotal", "total", "symbolTotal",
  ]), 0);
  const processed = num(first(source, [
    "processed_symbols", "processedSymbols", "marketProcessed", "processed", "completedSymbols",
  ]), 0);
  const success = num(first(source, [
    "success_symbols", "successSymbols", "marketSuccess", "success",
  ]), 0);
  const failed = num(first(source, [
    "failed_symbols", "failedSymbols", "marketFailed", "failed",
  ]), 0);
  const skipped = num(first(source, [
    "skipped_symbols", "skippedSymbols", "marketSkipped", "skipped",
  ]), 0);

  const directPercentage = num(first(source, ["percentage", "progressPercent", "marketProgress"]), NaN);
  const percentage = Number.isFinite(directPercentage)
    ? directPercentage
    : total > 0
      ? (processed / total) * 100
      : 0;

  const remainingRaw = first(source, ["remaining", "remainingSymbols", "marketRemaining"]);
  const remaining = remainingRaw == null
    ? Math.max(0, total - processed)
    : Math.max(0, num(remainingRaw, Math.max(0, total - processed)));

  const id = nullableText(first(source, ["id", "jobId", "job_id", "activeJobId"]));
  const jobId = nullableText(first(source, ["jobId", "job_id", "id", "activeJobId"]));

  return {
    ok: source.ok === undefined ? true : Boolean(source.ok),
    id,
    jobId,
    status: text(first(source, ["status", "jobStatus", "job_status"])) ?? "not_started",
    total_symbols: Math.max(0, total),
    processed_symbols: Math.max(0, processed),
    success_symbols: Math.max(0, success),
    failed_symbols: Math.max(0, failed),
    skipped_symbols: Math.max(0, skipped),
    current_symbol: nullableText(first(source, ["current_symbol", "currentSymbol"])),
    percentage: Math.min(100, Math.max(0, percentage)),
    remaining,
    error: text(first(source, ["error", "last_error", "lastError"])),
    last_error: nullableText(first(source, ["last_error", "lastError", "error"])),
    degraded: Boolean(source.degraded),
    statusSource: text(first(source, ["statusSource", "status_source"])),
    statusSchemaVersion: text(first(source, ["statusSchemaVersion", "status_schema_version"])),
    unifiedProgress: source.unifiedProgress === undefined ? undefined : Boolean(source.unifiedProgress),
    pipelineJobId: nullableText(first(source, ["pipelineJobId", "pipeline_job_id"])),
    pointerJobId: nullableText(first(source, ["pointerJobId", "pointer_job_id"])),
    queueJobId: nullableText(first(source, ["queueJobId", "queue_job_id"])),
    activeJobId: nullableText(first(source, ["activeJobId", "active_job_id", "jobId", "id"])),
    activeJobDate: nullableText(first(source, ["activeJobDate", "active_job_date", "jobDate", "job_date"])),
    auxiliaryWarnings: Array.isArray(source.auxiliaryWarnings)
      ? source.auxiliaryWarnings.map(String)
      : [],
    prioritySymbols: Array.isArray(source.prioritySymbols)
      ? source.prioritySymbols.map(String)
      : [],
    postprocess: normalizePostprocess(source.postprocess),
    bulkSnapshot: normalizeBulkSnapshot(source.bulkSnapshot),
    queueHeartbeat: normalizeQueueHeartbeat(source.queueHeartbeat),
    worker: record(source.worker) as UnifiedUpdateStatus["worker"],
  };
}

export function isUsableUnifiedUpdateStatus(status: UnifiedUpdateStatus | null | undefined) {
  if (!status) return false;
  return Boolean(
    status.id ||
    status.jobId ||
    Number(status.total_symbols ?? 0) > 0 ||
    String(status.status ?? "") === "completed",
  );
}
