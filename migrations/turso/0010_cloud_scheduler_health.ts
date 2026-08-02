import type { DatabaseMigration } from "@/migrations/database/types";

export const createCloudSchedulerHealthMigration: DatabaseMigration = {
  version: 10,
  name: "create_cloud_scheduler_health",
  async up(transaction) {
    await transaction.execute({ sql: `CREATE TABLE IF NOT EXISTS cloud_scheduler_runs (
      id TEXT PRIMARY KEY,
      job_id TEXT,
      trigger_source TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      started_at TEXT NOT NULL,
      heartbeat_at TEXT NOT NULL,
      completed_at TEXT,
      elapsed_ms INTEGER NOT NULL DEFAULT 0,
      batches_processed INTEGER NOT NULL DEFAULT 0,
      symbols_processed INTEGER NOT NULL DEFAULT 0,
      market_refreshed INTEGER NOT NULL DEFAULT 0,
      validation_refreshed INTEGER NOT NULL DEFAULT 0,
      hot_stocks_refreshed INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      FOREIGN KEY(job_id) REFERENCES cloud_update_jobs(id)
    )` });
    await transaction.execute({ sql: `CREATE TABLE IF NOT EXISTS cloud_health_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      checked_at TEXT NOT NULL,
      service TEXT NOT NULL,
      status TEXT NOT NULL,
      latency_ms INTEGER,
      details_json TEXT
    )` });
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_scheduler_runs_started ON cloud_scheduler_runs(started_at DESC)" });
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_health_checks_time ON cloud_health_checks(checked_at DESC)" });
  },
};
