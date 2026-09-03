import type { DatabaseMigration } from "@/migrations/database/types";

async function safeAlter(transaction: Parameters<DatabaseMigration["up"]>[0], sql: string) {
  try { await transaction.execute({ sql }); } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/duplicate column|already exists/i.test(message)) throw error;
  }
}

/** M8.10.6.2: rate-limit cooldown prevents four immediate retries from turning an hourly quota into 1,500 false failures. */
export const marketUniverseFailureClassificationMigration: DatabaseMigration = {
  version: 26,
  name: "market_universe_failure_classification",
  async up(transaction) {
    await safeAlter(transaction, "ALTER TABLE cloud_update_items ADD COLUMN next_attempt_at TEXT");
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_cloud_items_retry_at ON cloud_update_items(job_id,status,next_attempt_at,attempts)" });
  },
};
