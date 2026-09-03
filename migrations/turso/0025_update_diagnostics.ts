import type { DatabaseMigration } from "@/migrations/database/types";

async function safeAlter(transaction: Parameters<DatabaseMigration["up"]>[0], sql: string) {
  try { await transaction.execute({ sql }); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/duplicate column|already exists/i.test(message)) throw error;
  }
}

/** M8.10.6.1: persist skipped count so status polling stays cheap. */
export const createUpdateDiagnosticsMigration: DatabaseMigration = {
  version: 25,
  name: "update_diagnostics_m81061",
  async up(transaction) {
    await safeAlter(transaction, "ALTER TABLE cloud_update_jobs ADD COLUMN skipped_symbols INTEGER NOT NULL DEFAULT 0");
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_cloud_items_diagnostics ON cloud_update_items(job_id,status,attempts,updated_at)" });
  },
};
