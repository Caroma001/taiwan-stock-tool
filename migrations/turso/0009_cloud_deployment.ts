import type { DatabaseMigration } from "@/migrations/database/types";

export const createCloudDeploymentMigration: DatabaseMigration = {
  version: 9,
  name: "create_cloud_deployment_jobs",
  async up(transaction) {
    await transaction.execute({ sql: `CREATE TABLE IF NOT EXISTS cloud_update_jobs (
      id TEXT PRIMARY KEY,
      job_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'waiting',
      total_symbols INTEGER NOT NULL DEFAULT 0,
      processed_symbols INTEGER NOT NULL DEFAULT 0,
      success_symbols INTEGER NOT NULL DEFAULT 0,
      failed_symbols INTEGER NOT NULL DEFAULT 0,
      batch_size INTEGER NOT NULL DEFAULT 12,
      current_symbol TEXT,
      last_error TEXT,
      started_at TEXT,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      UNIQUE(job_date)
    )` });
    await transaction.execute({ sql: `CREATE TABLE IF NOT EXISTS cloud_update_items (
      job_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'waiting',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(job_id, symbol),
      FOREIGN KEY(job_id) REFERENCES cloud_update_jobs(id)
    )` });
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_cloud_items_queue ON cloud_update_items(job_id,status,symbol)" });
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_cloud_jobs_updated ON cloud_update_jobs(updated_at DESC)" });
  },
};
