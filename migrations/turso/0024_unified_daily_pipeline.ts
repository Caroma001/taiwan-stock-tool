import type { DatabaseMigration } from "@/migrations/database/types";

/**
 * M8.10.6
 * Persist the post-processing state of the single Daily Update pipeline.
 * The table is deliberately small: one row per cloud update job.
 */
export const createUnifiedDailyPipelineMigration: DatabaseMigration = {
  version: 24,
  name: "unified_daily_pipeline_m8106",
  async up(transaction) {
    await transaction.execute({ sql: `CREATE TABLE IF NOT EXISTS daily_update_pipeline_state (
      job_id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'waiting',
      stage TEXT NOT NULL DEFAULT 'waiting',
      candidate_count INTEGER NOT NULL DEFAULT 0,
      chip_success INTEGER NOT NULL DEFAULT 0,
      chip_failed INTEGER NOT NULL DEFAULT 0,
      breakout_scored INTEGER NOT NULL DEFAULT 0,
      stealth_scored INTEGER NOT NULL DEFAULT 0,
      radar_failed INTEGER NOT NULL DEFAULT 0,
      detail_json TEXT,
      last_error TEXT,
      started_at TEXT,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    )` });
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_daily_pipeline_status ON daily_update_pipeline_state(status,updated_at)" });
  },
};
