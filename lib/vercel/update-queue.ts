import { createHash } from "node:crypto";
import { send } from "@vercel/queue";
import { TursoDatabaseAdapter } from "@/adapters/turso";
import { getTursoClient } from "@/lib/turso";
import { recordPublishedQueueJob } from "@/lib/cloud/active-job";
import { recordQueuePublished, type QueueRole } from "@/lib/vercel/queue-runtime";

export const DAILY_UPDATE_TOPIC = "twstock-daily-update";

export type DailyUpdateMessage = {
  jobId: string;
  requestedAt: string;
  source: "manual" | "scheduled" | "resume" | "chain" | "bootstrap" | "safety";
  role?: QueueRole;
  expectedProcessed?: number;
  continuationId?: string;
  predecessorContinuationId?: string | null;
  generation?: number;
  watchContinuationId?: string | null;
  watchGeneration?: number | null;
  watchExpectedProcessed?: number;
  safetyAttempt?: number;
  recoveryReason?: string | null;
};

export function isVercelRuntime() {
  return Boolean(process.env.VERCEL);
}

export function continuationIdForKey(jobId: string, idempotencyKey: string) {
  return `q-${createHash("sha256")
    .update(`${jobId}:${idempotencyKey}`)
    .digest("hex")
    .slice(0, 24)}`;
}

function randomContinuationId(jobId: string) {
  return `q-${createHash("sha256")
    .update(`${jobId}:${Date.now()}:${Math.random()}`)
    .digest("hex")
    .slice(0, 24)}`;
}

/**
 * M8.10.22 durable publisher.
 *
 * Every work message carries a Queue generation. recordQueuePublished() is a
 * required part of publishing: if Turso persistence fails after Vercel accepted
 * the message, this function throws. A caller retrying with the same idempotency
 * key lets Vercel deduplicate the send while the persistence step is retried.
 */
export async function publishDailyUpdate(
  message: DailyUpdateMessage,
  delaySeconds = 0,
  idempotencyKey?: string,
) {
  const role: QueueRole = message.role ?? "work";
  const generation = Math.max(1, Math.floor(Number(message.generation ?? 1)));
  const continuationId = message.continuationId
    ?? (idempotencyKey
      ? continuationIdForKey(message.jobId, idempotencyKey)
      : randomContinuationId(message.jobId));

  const payload: DailyUpdateMessage = {
    ...message,
    role,
    generation,
    continuationId,
    expectedProcessed: Math.max(0, Number(message.expectedProcessed ?? 0)),
  };

  if (!isVercelRuntime()) {
    return {
      queued: false,
      local: true,
      messageId: null,
      continuationId,
      generation,
      role,
    };
  }

  const result = await send(DAILY_UPDATE_TOPIC, payload, {
    delaySeconds: Math.max(0, Math.floor(delaySeconds)),
    retentionSeconds: 24 * 60 * 60,
    ...(idempotencyKey ? { idempotencyKey } : {}),
  });

  const db = new TursoDatabaseAdapter(getTursoClient());
  await recordQueuePublished(db, {
    jobId: payload.jobId,
    role,
    continuationId,
    messageId: result.messageId ?? null,
    source: payload.source,
    expectedProcessed: Number(payload.expectedProcessed ?? 0),
    generation,
    predecessorContinuationId: payload.predecessorContinuationId ?? null,
    watchContinuationId: payload.watchContinuationId ?? null,
    watchGeneration: payload.watchGeneration ?? null,
    recoveryReason: payload.recoveryReason ?? null,
  });

  // Safety messages are observers only and must never replace the active
  // Queue pointer. Work/recovery messages become the canonical Queue pointer.
  if (role === "work") {
    await recordPublishedQueueJob(db, payload.jobId, result.messageId ?? null);
  }

  return {
    queued: true,
    local: false,
    messageId: result.messageId,
    continuationId,
    generation,
    role,
  };
}
