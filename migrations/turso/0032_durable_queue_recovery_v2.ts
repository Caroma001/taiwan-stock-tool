import type { DatabaseMigration } from "@/migrations/database/types";

/**
 * M8.10.22 — Durable Queue Recovery v2
 *
 * The M8.10.21 runtime row could prove that a message was published, but its
 * consumed/heartbeat timestamps were not tied to a continuation ID. A delayed
 * safety message therefore could not distinguish:
 *
 *   successor published  !=  successor actually consumed
 *
 * M8.10.22 adds generation fencing and continuation-specific evidence.
 */
export const durableQueueRecoveryV2Migration: DatabaseMigration = {
  version: 32,
  name: "durable_queue_recovery_v2_m81022",
  async up(transaction) {
    const statements = [
      "ALTER TABLE daily_queue_runtime ADD COLUMN generation INTEGER NOT NULL DEFAULT 1",
      "ALTER TABLE daily_queue_runtime ADD COLUMN predecessor_continuation_id TEXT",
      "ALTER TABLE daily_queue_runtime ADD COLUMN consumed_continuation_id TEXT",
      "ALTER TABLE daily_queue_runtime ADD COLUMN heartbeat_continuation_id TEXT",
      "ALTER TABLE daily_queue_runtime ADD COLUMN recovery_count INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE daily_queue_runtime ADD COLUMN last_recovery_reason TEXT",
      "ALTER TABLE daily_queue_runtime ADD COLUMN last_recovery_at TEXT",
      "ALTER TABLE daily_queue_runtime ADD COLUMN superseded_continuation_id TEXT",
      "ALTER TABLE daily_queue_runtime ADD COLUMN safety_watch_continuation_id TEXT",
      "ALTER TABLE daily_queue_runtime ADD COLUMN safety_watch_generation INTEGER",
      "ALTER TABLE daily_queue_runtime ADD COLUMN safety_phase TEXT",
      "ALTER TABLE daily_queue_runtime ADD COLUMN safety_last_checked_at TEXT",
      "ALTER TABLE daily_queue_runtime ADD COLUMN safety_publish_count INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE daily_queue_runtime ADD COLUMN safety_consume_count INTEGER NOT NULL DEFAULT 0"
    ];

    for (const sql of statements) {
      try {
        await transaction.execute({ sql });
      } catch (error) {
        // ALTER TABLE ADD COLUMN has no IF NOT EXISTS in the SQLite version
        // used by some Turso deployments. A partially applied migration is safe
        // to resume: duplicate-column failures are intentionally ignored.
        const message = error instanceof Error ? error.message : String(error);
        if (!/duplicate column|already exists/i.test(message)) throw error;
      }
    }

    await transaction.execute({
      sql: "CREATE INDEX IF NOT EXISTS idx_daily_queue_runtime_generation ON daily_queue_runtime(job_id,generation,continuation_id)",
    });
  },
};
