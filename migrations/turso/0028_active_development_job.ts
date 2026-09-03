import type { DatabaseMigration } from "@/migrations/database/types";

/**
 * M8.10.12
 * Persist one canonical active Development Daily Update job id.
 * Status / Watchdog / Resume must follow this pointer instead of guessing by
 * updated_at or date strings. The table contains one row only.
 */
export const activeDevelopmentJobMigration: DatabaseMigration = {
  version: 28,
  name: "active_development_job_m81012",
  async up(transaction) {
    await transaction.execute({
      sql: `CREATE TABLE IF NOT EXISTS active_development_job (
        singleton_key TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        job_date TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    });
    await transaction.execute({
      sql: "CREATE INDEX IF NOT EXISTS idx_active_development_job_id ON active_development_job(job_id)",
    });
  },
};
