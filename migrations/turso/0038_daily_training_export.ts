import type { DatabaseMigration } from "@/migrations/database/types";

/**
 * M8.11.9 — persistent per-day export/download tracking.
 *
 * The training records themselves stay inside the compact daily report JSON,
 * so this table adds only one tiny status row per trading day.
 */
export const dailyTrainingExportMigration: DatabaseMigration = {
  version: 38,
  name: "daily_training_export_status_m8119",
  async up(transaction) {
    await transaction.execute({ sql: `CREATE TABLE IF NOT EXISTS daily_report_export_status (
      report_date TEXT PRIMARY KEY,
      json_downloaded_at TEXT,
      json_download_count INTEGER NOT NULL DEFAULT 0,
      json_downloaded_signature TEXT,
      txt_downloaded_at TEXT,
      txt_download_count INTEGER NOT NULL DEFAULT 0,
      last_filename TEXT,
      updated_at TEXT NOT NULL
    )` });
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_daily_report_export_status_date ON daily_report_export_status(report_date DESC)" });
  },
};
