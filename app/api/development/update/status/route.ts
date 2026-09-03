import { NextResponse } from "next/server";
import { readDevelopmentUpdateStatus } from "@/lib/development/update-service";
import { getDevelopmentUpdateWorkerState } from "@/lib/development/update-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type StatusPayload = Record<string, unknown>;

// Warm Vercel instances can preserve this between invocations. The browser also
// keeps its own last-known-good snapshot, so a transient Turso read never needs
// to visually collapse a running 2,000+ symbol job to 0/0.
let lastKnownGoodStatus: StatusPayload | null = null;
let lastKnownGoodAt = 0;
const SERVER_STATUS_CACHE_MS = 10_000;
const STATUS_SCHEMA_VERSION = "M8.10.22-durable-recovery-v2";

const fallback = (error?: unknown): StatusPayload => ({
  ok: true,
  degraded: true,
  error: error instanceof Error ? error.message : error ? String(error) : undefined,
  id: null,
  jobId: null,
  status: "unavailable",
  total_symbols: 0,
  processed_symbols: 0,
  success_symbols: 0,
  failed_symbols: 0,
  skipped_symbols: 0,
  current_symbol: null,
  percentage: 0,
  remaining: 0,
  prioritySymbols: [],
  auxiliaryWarnings: [],
  postprocess: null,
  worker: {
    running: false,
    stopRequested: false,
    lastError: error instanceof Error ? error.message : error ? String(error) : null,
  },
});

function withWorker(payload: StatusPayload): StatusPayload {
  return {
    ...fallback(),
    ...payload,
    ok: true,
    degraded: Boolean(payload.degraded),
    worker: {
      ...(fallback().worker as Record<string, unknown>),
      ...getDevelopmentUpdateWorkerState(),
    },
  };
}

export async function GET() {
  try {
    // M8.10.12: collapse duplicate browser/tab requests on the same warm Vercel
    // instance into one Turso row read. The client already polls at 12 seconds.
    if (lastKnownGoodStatus && Date.now() - lastKnownGoodAt < SERVER_STATUS_CACHE_MS) {
      return NextResponse.json({ ...lastKnownGoodStatus, statusSource: "warm_cache", statusSchemaVersion: STATUS_SCHEMA_VERSION });
    }
    const status = await readDevelopmentUpdateStatus();
    const basePayload: StatusPayload = { ...withWorker(status as StatusPayload), statusSchemaVersion: STATUS_SCHEMA_VERSION };
    const payload: StatusPayload = {
      ...basePayload,
      // M8.10.22: canonical UI contract + durable Queue heartbeat telemetry. The same numbers are
      // available both at the legacy top level and in unifiedStatus so older
      // clients remain compatible while new UI code has one binding source.
      unifiedStatus: {
        id: basePayload.id ?? basePayload.jobId ?? null,
        jobId: basePayload.jobId ?? basePayload.id ?? null,
        status: basePayload.status ?? "not_started",
        total_symbols: Number(basePayload.total_symbols ?? 0),
        processed_symbols: Number(basePayload.processed_symbols ?? 0),
        success_symbols: Number(basePayload.success_symbols ?? 0),
        failed_symbols: Number(basePayload.failed_symbols ?? 0),
        skipped_symbols: Number(basePayload.skipped_symbols ?? 0),
        current_symbol: basePayload.current_symbol ?? null,
        last_error: basePayload.last_error ?? basePayload.error ?? null,
        percentage: Number(basePayload.percentage ?? 0),
        remaining: Number(basePayload.remaining ?? 0),
        postprocess: basePayload.postprocess ?? null,
        bulkSnapshot: basePayload.bulkSnapshot ?? null,
        queueHeartbeat: basePayload.queueHeartbeat ?? null,
        pipelineJobId: basePayload.pipelineJobId ?? null,
        pointerJobId: basePayload.pointerJobId ?? null,
        queueJobId: basePayload.queueJobId ?? null,
        statusSource: basePayload.statusSource ?? "unified_active_pointer",
        unifiedProgress: true,
      },
    };
    const degraded = Boolean(payload.degraded) || String(payload.status ?? "") === "unavailable";

    if (!degraded && (payload.id || payload.jobId || Number(payload.total_symbols ?? 0) > 0)) {
      lastKnownGoodStatus = payload;
      lastKnownGoodAt = Date.now();
    }

    if (degraded && lastKnownGoodStatus) {
      return NextResponse.json({
        ...lastKnownGoodStatus,
        ok: true,
        degraded: true,
        statusSource: "last_known_good",
        error: payload.error ?? "Turso status temporarily unavailable",
        auxiliaryWarnings: [
          ...((lastKnownGoodStatus.auxiliaryWarnings as string[] | undefined) ?? []),
          "Turso 狀態查詢暫時失敗；目前顯示最近一次成功讀取的進度。",
        ],
      });
    }

    return NextResponse.json(payload);
  } catch (error) {
    console.error("[development/update/status] degraded fallback:", error);
    if (lastKnownGoodStatus) {
      return NextResponse.json({
        ...lastKnownGoodStatus,
        ok: true,
        degraded: true,
        statusSource: "last_known_good",
        error: error instanceof Error ? error.message : String(error),
        auxiliaryWarnings: [
          ...((lastKnownGoodStatus.auxiliaryWarnings as string[] | undefined) ?? []),
          "Turso 狀態查詢暫時失敗；目前顯示最近一次成功讀取的進度。",
        ],
      });
    }
    return NextResponse.json(fallback(error), { status: 200 });
  }
}
