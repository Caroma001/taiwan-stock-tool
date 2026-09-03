import { NextResponse } from "next/server";
import { TursoDatabaseAdapter } from "@/adapters/turso";
import { getTursoClient } from "@/lib/turso";
import { assertDevelopmentMode } from "@/lib/development/config";
import { readDevelopmentUpdateStatus } from "@/lib/development/update-service";
import { resumeLatestDevelopmentUpdateWorker } from "@/lib/development/update-worker";
import {
  continuationIdForKey,
  isVercelRuntime,
  publishDailyUpdate,
} from "@/lib/vercel/update-queue";
import {
  claimQueueRecoveryLease,
  releaseQueueRecoveryLease,
} from "@/lib/vercel/queue-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  let recoveryToken: string | null = null;
  let recoveryJobId = "";
  let recoveryGeneration = 1;
  let recoveryContinuationId: string | null = null;

  try {
    assertDevelopmentMode();

    if (!isVercelRuntime()) {
      return NextResponse.json(await resumeLatestDevelopmentUpdateWorker());
    }

    const status = await readDevelopmentUpdateStatus() as {
      id?: unknown;
      jobId?: unknown;
      status?: unknown;
      remaining?: unknown;
      processed_symbols?: unknown;
      bulkSnapshot?: { nextRetryAt?: string | null } | null;
      queueHeartbeat?: {
        needsBootstrap?: boolean;
        consumerAlive?: boolean;
        waitingForConsumer?: boolean;
        displayState?: string;
        generation?: number;
        continuationId?: string | null;
      } | null;
    };

    const jobId = String(status.id ?? status.jobId ?? "").trim();
    recoveryJobId = jobId;
    const remaining = Number(status.remaining ?? 0);
    const statusName = String(status.status ?? "");
    const processed = Number(status.processed_symbols ?? 0);

    if (
      !jobId
      || remaining <= 0
      || statusName === "completed"
      || statusName === "postprocessing"
    ) {
      return NextResponse.json({
        ok: true,
        resumed: false,
        reason: "no_active_market_job",
        jobId: jobId || null,
      });
    }

    const nextRetryAt = status.bulkSnapshot?.nextRetryAt ?? null;
    if (nextRetryAt && Date.parse(nextRetryAt) > Date.now()) {
      return NextResponse.json({
        ok: true,
        resumed: false,
        reason: "cooldown",
        jobId,
        nextRetryAt,
      });
    }

    const heartbeat = status.queueHeartbeat;
    if (heartbeat && !heartbeat.needsBootstrap) {
      return NextResponse.json({
        ok: true,
        resumed: false,
        reason: heartbeat.consumerAlive
          ? "consumer_alive"
          : heartbeat.waitingForConsumer
            ? "already_published"
            : "queue_healthy",
        jobId,
        queueState: heartbeat.displayState ?? null,
      });
    }

    const currentGeneration = Math.max(
      1,
      Math.floor(Number(heartbeat?.generation ?? 1)),
    );
    const currentContinuationId = heartbeat?.continuationId ?? null;
    recoveryGeneration = currentGeneration;
    recoveryContinuationId = currentContinuationId;

    const db = new TursoDatabaseAdapter(getTursoClient());
    const reason = currentContinuationId
      ? "status_detected_orphan_or_stalled_continuation"
      : "legacy_job_without_queue_runtime";

    const lease = await claimQueueRecoveryLease(db, {
      jobId,
      expectedGeneration: currentGeneration,
      expectedContinuationId: currentContinuationId,
      reason,
      ttlSeconds: 60,
    });
    recoveryToken = lease.token;

    if (!lease.claimed || !lease.token) {
      return NextResponse.json({
        ok: true,
        resumed: false,
        reason: "recovery_already_claimed_or_queue_revived",
        jobId,
      });
    }

    const nextGeneration = lease.nextGeneration;
    const recoveryKey =
      `${jobId}:bootstrap-recovery:g${nextGeneration}:${currentContinuationId ?? "none"}`;
    const continuationId =
      continuationIdForKey(jobId, recoveryKey);

    const queue = await publishDailyUpdate(
      {
        jobId,
        requestedAt: new Date().toISOString(),
        source: "bootstrap",
        role: "work",
        generation: nextGeneration,
        continuationId,
        predecessorContinuationId: currentContinuationId,
        expectedProcessed: processed,
        recoveryReason: reason,
      },
      0,
      recoveryKey,
    );

    return NextResponse.json({
      ok: true,
      resumed: true,
      execution: "vercel-queue-durable-recovery-v2",
      jobId,
      processed,
      remaining,
      previousGeneration: currentGeneration,
      generation: nextGeneration,
      recoveryLeaseUntil: lease.leaseUntil,
      queue,
    });
  } catch (error) {
    if (recoveryJobId && recoveryToken) {
      const db = new TursoDatabaseAdapter(getTursoClient());
      await releaseQueueRecoveryLease(db, {
        jobId: recoveryJobId,
        token: recoveryToken,
        expectedGeneration: recoveryGeneration,
        expectedContinuationId: recoveryContinuationId,
        error,
      }).catch(() => undefined);
    }

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
