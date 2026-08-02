import type { DatabaseMigration } from "@/migrations/database/types";

export const createProductionMonitoringMigration: DatabaseMigration = {
  version: 11,
  name: "create_production_monitoring",
  async up(transaction) {
    await transaction.execute({ sql: `CREATE TABLE IF NOT EXISTS production_incidents (
      id TEXT PRIMARY KEY,
      incident_key TEXT NOT NULL,
      status TEXT NOT NULL,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT,
      deployment_url TEXT,
      commit_sha TEXT,
      opened_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT,
      notification_sent INTEGER NOT NULL DEFAULT 0,
      rollback_requested INTEGER NOT NULL DEFAULT 0,
      details_json TEXT
    )` });
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_production_incidents_status ON production_incidents(status, updated_at DESC)" });
    await transaction.execute({ sql: "CREATE UNIQUE INDEX IF NOT EXISTS idx_production_incidents_open_key ON production_incidents(incident_key) WHERE status='open'" });
  },
};
