import { handleCallback } from "@vercel/queue";
import { TursoDatabaseAdapter } from "@/adapters/turso";
import { getTursoClient } from "@/lib/turso";
import { MigrationRunner } from "@/migrations/database/MigrationRunner";
import { tursoMigrations } from "@/migrations/turso";
import { runDevelopmentUpdateStep } from "@/lib/development/update-service";
import {
  continuationIdForKey,
  publishDailyUpdate,
  type DailyUpdateMessage,
} from "@/lib/vercel/update-queue";
import {
  claimQueueRecoveryLease,
  claimWorkMessage,
  readQueueRuntime,
  recordQueueCompleted,
  recordQueueError,
  recordQueueHeartbeat,
  recordSafetyObservation,
  releaseQueueRecoveryLease,
} from "@/lib/vercel/queue-runtime";
import type { DatabaseRow } from "@/lib/database";

export const runtime = "nodejs";
export const maxDuration = 300;

// The monitor is deliberately later than the "healthy heartbeat" window.
// Published alone is NOT considered healthy.
const SAFETY_NET_DELAY_SECONDS = 150;
const HEALTHY_HEARTBEAT_SECONDS = 120;
const ORPHAN_PUBLISHED_SECONDS = 120;

class QueueContinuationSupersededError extends Error {
  constructor() {
    super("Queue continuation was superseded by a newer generation");
    this.name = "QueueContinuationSupersededError";
  }
}

function ageSeconds(value: string | null | undefined) {
  if (!value) return Number.POSITIVE_INFINITY;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((Date.now() - ms) / 1000));
}

function continuationDelaySeconds(result: Record<string, unknown>) {
  const nextRetryAt = typeof result.nextRetryAt === "string"
    ? Date.parse(result.nextRetryAt)
    : Number.NaN;
  if (Number.isFinite(nextRetryAt) && nextRetryAt > Date.now()) {
    return Math.min(3600, Math.max(5, Math.ceil((nextRetryAt - Date.now()) / 1000)));
  }
  if (result.rateLimited) return 60;
  return 2;
}

async function database() {
  const db = new TursoDatabaseAdapter(getTursoClient());
  await new MigrationRunner(db, tursoMigrations).migrate();
  return db;
}

async function runSafetyMonitor(
  db: TursoDatabaseAdapter,
  message: DailyUpdateMessage,
  safetyContinuationId: string,
) {
  const watchContinuationId = String(message.watchContinuationId ?? "").trim();
  const watchPredecessorContinuationId = String(message.predecessorContinuationId ?? "").trim();
  const watchGeneration = Math.max(
    1,
    Math.floor(Number(message.watchGeneration ?? message.generation ?? 1)),
  );
  const watchExpectedProcessed = Math.max(
    0,
    Number(message.watchExpectedProcessed ?? message.expectedProcessed ?? 0),
  );

  if (!watchContinuationId) {
    await recordSafetyObservation(db, {
      jobId: message.jobId,
      safetyContinuationId,
      watchContinuationId: null,
      watchGeneration,
      phase: "Safety-net：沒有 watch continuation，略過",
    });
    return;
  }

  const [runtimeState, jobResult] = await Promise.all([
    readQueueRuntime(db, message.jobId),
    db.execute<DatabaseRow>({
      sql: "SELECT status,processed_symbols,total_symbols,updated_at FROM cloud_update_jobs WHERE id=? LIMIT 1",
      args: [message.jobId],
    }),
  ]);
  const job = jobResult.rows[0];
  const completed = String(job?.status ?? "") === "completed"
    || Number(job?.processed_symbols ?? 0) >= Number(job?.total_symbols ?? 0);

  if (completed) {
    await recordSafetyObservation(db, {
      jobId: message.jobId,
      safetyContinuationId,
      watchContinuationId,
      watchGeneration,
      phase: "Safety-net：任務已完成，略過",
    });
    return;
  }

  if (!runtimeState) {
    await recordSafetyObservation(db, {
      jobId: message.jobId,
      safetyContinuationId,
      watchContinuationId,
      watchGeneration,
      phase: "Safety-net：runtime 不存在，交由 status bootstrap",
    });
    return;
  }

  // A newer generation already replaced this chain. Old monitors must not
  // resurrect an obsolete continuation.
  if (runtimeState.generation > watchGeneration) {
    await recordSafetyObservation(db, {
      jobId: message.jobId,
      safetyContinuationId,
      watchContinuationId,
      watchGeneration,
      phase: `Safety-net：Generation ${watchGeneration} 已被 ${runtimeState.generation} 取代，略過`,
    });
    return;
  }

  const currentIsPredecessor = Boolean(
    runtimeState.generation === watchGeneration
    && watchPredecessorContinuationId
    && runtimeState.continuationId === watchPredecessorContinuationId
  );

  // Same generation, but neither watched successor nor its predecessor is
  // current: the watched successor must have run far enough to publish a newer
  // continuation. THAT is valid proof of chain advancement.
  if (
    runtimeState.generation === watchGeneration
    && runtimeState.continuationId
    && runtimeState.continuationId !== watchContinuationId
    && !currentIsPredecessor
  ) {
    await recordSafetyObservation(db, {
      jobId: message.jobId,
      safetyContinuationId,
      watchContinuationId,
      watchGeneration,
      phase: "Safety-net：watched successor 已成功發布更下一棒，健康",
    });
    return;
  }

  const currentIsWatched = runtimeState.generation === watchGeneration
    && runtimeState.continuationId === watchContinuationId;
  const consumedIsWatched = runtimeState.consumedContinuationId === watchContinuationId;
  const heartbeatIsWatched = runtimeState.heartbeatContinuationId === watchContinuationId;
  const heartbeatAge = heartbeatIsWatched
    ? ageSeconds(runtimeState.heartbeatAt)
    : Number.POSITIVE_INFINITY;
  const consumedAge = consumedIsWatched
    ? ageSeconds(runtimeState.consumedAt)
    : Number.POSITIVE_INFINITY;
  const publishedAge = currentIsWatched
    ? ageSeconds(runtimeState.publishedAt)
    : Number.POSITIVE_INFINITY;

  // True health requires proof tied to the watched successor.
  if (
    currentIsWatched
    && (
      (heartbeatIsWatched && heartbeatAge <= HEALTHY_HEARTBEAT_SECONDS)
      || (consumedIsWatched && consumedAge <= HEALTHY_HEARTBEAT_SECONDS)
    )
  ) {
    await recordSafetyObservation(db, {
      jobId: message.jobId,
      safetyContinuationId,
      watchContinuationId,
      watchGeneration,
      phase: heartbeatIsWatched
        ? `Safety-net：successor heartbeat ${heartbeatAge}s，健康`
        : `Safety-net：successor 已於 ${consumedAge}s 前 Consume，健康`,
    });
    return;
  }

  // The safety message should normally arrive after ORPHAN_PUBLISHED_SECONDS.
  // If Vercel delivers it unusually early, re-arm once instead of making a
  // premature generation switch.
  if (currentIsWatched && publishedAge < ORPHAN_PUBLISHED_SECONDS) {
    const retryAfter = Math.max(
      15,
      ORPHAN_PUBLISHED_SECONDS - publishedAge + 10,
    );
    const attempt = Math.max(0, Number(message.safetyAttempt ?? 0)) + 1;
    await recordSafetyObservation(db, {
      jobId: message.jobId,
      safetyContinuationId,
      watchContinuationId,
      watchGeneration,
      phase: `Safety-net：successor 僅發布 ${publishedAge}s，${retryAfter}s 後再檢查`,
    });
    await publishDailyUpdate(
      {
        jobId: message.jobId,
        requestedAt: new Date().toISOString(),
        source: "safety",
        role: "safety",
        generation: watchGeneration,
        expectedProcessed: watchExpectedProcessed,
        watchContinuationId,
        watchGeneration,
        watchExpectedProcessed,
        safetyAttempt: attempt,
      },
      retryAfter,
      `${message.jobId}:safety-recheck:g${watchGeneration}:${watchContinuationId}:${attempt}`,
    );
    return;
  }

  // Published but never consumed, or consumed but heartbeat died without the
  // chain advancing. Fence it, raise generation, and publish a recovery work
  // message. Old generation messages become ACK/NO-OP when they arrive later.
  const recoveryReason = currentIsPredecessor
    ? "successor_not_published"
    : !consumedIsWatched
      ? "successor_not_consumed"
      : "successor_heartbeat_stale";

  const recoveryTargetContinuationId = currentIsPredecessor
    ? runtimeState.continuationId
    : watchContinuationId;

  const lease = await claimQueueRecoveryLease(db, {
    jobId: message.jobId,
    expectedGeneration: watchGeneration,
    expectedContinuationId: recoveryTargetContinuationId,
    reason: recoveryReason,
    ttlSeconds: 60,
  });

  if (!lease.claimed || !lease.token) {
    await recordSafetyObservation(db, {
      jobId: message.jobId,
      safetyContinuationId,
      watchContinuationId,
      watchGeneration,
      phase: "Safety-net：Recovery lease 未取得；另一個 recovery/consumer 已接手",
    });
    return;
  }

  const nextGeneration = lease.nextGeneration;
  const recoveryKey =
    `${message.jobId}:recovery:g${nextGeneration}:${recoveryTargetContinuationId ?? "none"}`;
  const recoveryContinuationId =
    continuationIdForKey(message.jobId, recoveryKey);

  try {
    const queue = await publishDailyUpdate(
      {
        jobId: message.jobId,
        requestedAt: new Date().toISOString(),
        source: "safety",
        role: "work",
        generation: nextGeneration,
        continuationId: recoveryContinuationId,
        predecessorContinuationId: recoveryTargetContinuationId,
        expectedProcessed: Number(job?.processed_symbols ?? watchExpectedProcessed),
        recoveryReason,
      },
      0,
      recoveryKey,
    );

    await recordSafetyObservation(db, {
      jobId: message.jobId,
      safetyContinuationId,
      watchContinuationId,
      watchGeneration,
      phase:
        `Safety-net：${recoveryReason} → Generation ${nextGeneration} Recovery 已發布 ${queue.continuationId}`,
    });
  } catch (error) {
    await releaseQueueRecoveryLease(db, {
      jobId: message.jobId,
      token: lease.token,
      expectedGeneration: watchGeneration,
      expectedContinuationId: recoveryTargetContinuationId,
      error,
    });
    throw error;
  }
}

export const POST = handleCallback(async (message: DailyUpdateMessage) => {
  if (!message?.jobId) throw new Error("Missing jobId");

  const db = await database();
  const role = message.role ?? "work";
  const continuationId = String(message.continuationId ?? "").trim();
  if (!continuationId) throw new Error("Missing continuationId");

  if (role === "safety") {
    await runSafetyMonitor(db, message, continuationId);
    return;
  }

  const generation = Math.max(
    1,
    Math.floor(Number(message.generation ?? 1)),
  );
  const expectedProcessed = Math.max(
    0,
    Number(message.expectedProcessed ?? 0),
  );

  // Generation fence. Stale/late messages are acknowledged without doing any
  // market work, so an old deployment/old continuation cannot compete with a
  // newer recovery generation.
  const claim = await claimWorkMessage(db, {
    jobId: message.jobId,
    continuationId,
    generation,
    source: message.source,
    expectedProcessed,
    recovery: Boolean(message.recoveryReason)
      || message.source === "bootstrap"
      || message.source === "safety",
  });

  if (!claim.accepted) {
    console.info(
      `[twstock-daily-update] ACK/NO-OP ${claim.reason} job=${message.jobId} generation=${generation} continuation=${continuationId}`,
    );
    return;
  }

  try {
    const firstHeartbeat = await recordQueueHeartbeat(db, {
      jobId: message.jobId,
      continuationId,
      generation,
      phase: "Queue Consumer：開始執行",
      expectedProcessed,
    });
    if (!firstHeartbeat) throw new QueueContinuationSupersededError();

    const result = await runDevelopmentUpdateStep(message.jobId, {
      heartbeat: async (phase, processed) => {
        try {
          const accepted = await recordQueueHeartbeat(db, {
            jobId: message.jobId,
            continuationId,
            generation,
            phase,
            expectedProcessed: processed,
          });
          if (!accepted) throw new QueueContinuationSupersededError();
        } catch (error) {
          if (error instanceof QueueContinuationSupersededError) throw error;
          // A transient telemetry write must not abort useful market work.
          console.warn(
            "[twstock-daily-update] heartbeat write skipped:",
            error,
          );
        }
      },
    });

    const pending = Number(result.pending ?? 0);
    const processed = Number(result.processed ?? expectedProcessed);
    const completed = result.status === "completed" || pending === 0;

    const checkpointAccepted = await recordQueueHeartbeat(db, {
      jobId: message.jobId,
      continuationId,
      generation,
      phase: completed
        ? "Queue Consumer：市場資料完成"
        : `Queue Consumer：checkpoint ${processed}`,
      expectedProcessed: processed,
    });
    if (!checkpointAccepted) throw new QueueContinuationSupersededError();

    if (completed) {
      await recordQueueCompleted(db, {
        jobId: message.jobId,
        continuationId,
        generation,
        phase: "市場資料與後處理完成",
      });
      return;
    }

    const delaySeconds = continuationDelaySeconds(
      result as Record<string, unknown>,
    );

    // Compute the successor ID before sending either message. Safety-net now
    // watches the successor (B), not the predecessor (A).
    const nextKey =
      `${message.jobId}:next:g${generation}:${continuationId}`;
    const nextContinuationId =
      continuationIdForKey(message.jobId, nextKey);

    // Arm the monitor first. If successor publishing subsequently fails, this
    // monitor can still detect that the watched continuation never became the
    // current/consumed message and the original message is also retried by
    // Vercel because we rethrow the publish failure.
    try {
      await publishDailyUpdate(
        {
          jobId: message.jobId,
          requestedAt: new Date().toISOString(),
          source: "safety",
          role: "safety",
          generation,
          expectedProcessed: processed,
          predecessorContinuationId: continuationId,
          watchContinuationId: nextContinuationId,
          watchGeneration: generation,
          watchExpectedProcessed: processed,
          safetyAttempt: 0,
        },
        SAFETY_NET_DELAY_SECONDS,
        `${message.jobId}:safety:g${generation}:${nextContinuationId}`,
      );
    } catch (safetyError) {
      console.warn(
        "[twstock-daily-update] safety monitor publish failed; main continuation will still be published:",
        safetyError,
      );
    }

    await publishDailyUpdate(
      {
        jobId: message.jobId,
        requestedAt: new Date().toISOString(),
        source: "chain",
        role: "work",
        generation,
        continuationId: nextContinuationId,
        predecessorContinuationId: continuationId,
        expectedProcessed: processed,
      },
      delaySeconds,
      nextKey,
    );
  } catch (error) {
    if (error instanceof QueueContinuationSupersededError) {
      // Recovery already fenced this generation. ACK the old callback instead
      // of asking Vercel to retry an obsolete message.
      console.info(
        `[twstock-daily-update] superseded generation ACK job=${message.jobId} generation=${generation} continuation=${continuationId}`,
      );
      return;
    }

    await recordQueueError(db, {
      jobId: message.jobId,
      continuationId,
      generation,
      error,
    });
    // Failed callbacks are intentionally re-thrown. Vercel Queue provides
    // at-least-once retry semantics for unacknowledged deliveries.
    throw error;
  }
});
