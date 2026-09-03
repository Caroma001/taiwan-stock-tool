import { runDevelopmentUpdateStep, readDevelopmentUpdateStatus } from "@/lib/development/update-service";

const LOOP_DELAY_MS = 450;
const EMPTY_BATCH_DELAY_MS = 1500;

type WorkerState = {
  jobId: string | null;
  running: boolean;
  stopRequested: boolean;
  lastStartedAt: string | null;
  lastError: string | null;
  promise: Promise<void> | null;
};

declare global {
  // eslint-disable-next-line no-var
  var __twstockDevelopmentUpdateWorker: WorkerState | undefined;
}

function getState(): WorkerState {
  if (!globalThis.__twstockDevelopmentUpdateWorker) {
    globalThis.__twstockDevelopmentUpdateWorker = {
      jobId: null,
      running: false,
      stopRequested: false,
      lastStartedAt: null,
      lastError: null,
      promise: null,
    };
  }

  return globalThis.__twstockDevelopmentUpdateWorker;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loop(jobId: string) {
  const state = getState();
  state.running = true;
  state.stopRequested = false;
  state.jobId = jobId;
  state.lastStartedAt = new Date().toISOString();
  state.lastError = null;

  try {
    while (!state.stopRequested) {
      const result = await runDevelopmentUpdateStep(jobId);

      if (result.status === "completed" || Number(result.pending ?? 0) === 0) {
        // M8.10.6: chip data + Winner25 live score + Stealth Radar are finalized
        // inside runDevelopmentUpdateStep, so local and Vercel execution share one pipeline.
        break;
      }

      const nextRetryAt = typeof result.nextRetryAt === "string" ? Date.parse(result.nextRetryAt) : Number.NaN;
      if (result.rateLimited || (Number(result.batchProcessed ?? 0) === 0 && Number.isFinite(nextRetryAt) && nextRetryAt > Date.now())) {
        // M8.10.6.2: do not hammer the upstream API while its hourly quota is
        // cooling down. Wake at most once per minute so pause/status remain responsive.
        const remainingMs = Number.isFinite(nextRetryAt) ? Math.max(5_000, nextRetryAt - Date.now()) : 60_000;
        await sleep(Math.min(60_000, remainingMs));
      } else if (Number(result.batchProcessed ?? 0) === 0) {
        await sleep(EMPTY_BATCH_DELAY_MS);
      } else {
        await sleep(LOOP_DELAY_MS);
      }
    }
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : String(error);
    console.error("[DEVELOPMENT_UPDATE_WORKER]", error);
  } finally {
    state.running = false;
    state.promise = null;
  }
}

export function ensureDevelopmentUpdateWorker(jobId: string) {
  const state = getState();

  if (state.running && state.jobId === jobId && state.promise) {
    return {
      ok: true,
      alreadyRunning: true,
      jobId,
      worker: getDevelopmentUpdateWorkerState(),
    };
  }

  state.stopRequested = false;
  state.promise = loop(jobId);

  return {
    ok: true,
    alreadyRunning: false,
    jobId,
    worker: getDevelopmentUpdateWorkerState(),
  };
}

export function stopDevelopmentUpdateWorker() {
  const state = getState();
  state.stopRequested = true;

  return {
    ok: true,
    jobId: state.jobId,
    worker: getDevelopmentUpdateWorkerState(),
  };
}

export function getDevelopmentUpdateWorkerState() {
  const state = getState();

  return {
    jobId: state.jobId,
    running: state.running,
    stopRequested: state.stopRequested,
    lastStartedAt: state.lastStartedAt,
    lastError: state.lastError,
  };
}

export async function resumeLatestDevelopmentUpdateWorker() {
  const status = (await readDevelopmentUpdateStatus()) as {
    id?: unknown;
    status?: unknown;
    remaining?: unknown;
  };
  const jobId = typeof status.id === "string" ? status.id : null;
  const statusName = String(status.status ?? "");
  const remaining = Number(status.remaining ?? 0);

  if (!jobId || remaining <= 0 || statusName === "completed") {
    return {
      ok: true,
      resumed: false,
      reason: "no_active_job",
      worker: getDevelopmentUpdateWorkerState(),
    };
  }

  const started = ensureDevelopmentUpdateWorker(jobId);

  return {
    ...started,
    resumed: true,
  };
}
