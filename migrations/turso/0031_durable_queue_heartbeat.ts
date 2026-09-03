import type { DatabaseMigration } from "@/migrations/database/types";

/**
 * M8.10.21 — Durable Queue Heartbeat
 *
 * One compact row per cloud job proves whether Vercel Queue was actually
 * published, consumed and is still alive. This replaces browser-side guessing.
 */
export const durableQueueHeartbeatMigration: DatabaseMigration = {
  version: 31,
  name: "durable_queue_heartbeat_m81021",
  async up(transaction) {
    await transaction.execute({ sql: `CREATE TABLE IF NOT EXISTS daily_queue_runtime (
      job_id TEXT PRIMARY KEY,
      state TEXT NOT NULL DEFAULT 'idle',
      continuation_id TEXT,
      message_id TEXT,
      source TEXT,
      expected_processed INTEGER NOT NULL DEFAULT 0,
      phase TEXT,
      published_at TEXT,
      consumed_at TEXT,
      heartbeat_at TEXT,
      completed_at TEXT,
      last_error TEXT,
      publish_count INTEGER NOT NULL DEFAULT 0,
      consume_count INTEGER NOT NULL DEFAULT 0,
      safety_continuation_id TEXT,
      safety_message_id TEXT,
      safety_published_at TEXT,
      safety_consumed_at TEXT,
      recovery_token TEXT,
      recovery_lease_until TEXT,
      updated_at TEXT NOT NULL
    )` });
    await transaction.execute({
      sql: "CREATE INDEX IF NOT EXISTS idx_daily_queue_runtime_health ON daily_queue_runtime(state,heartbeat_at,published_at)",
    });
  },
};
