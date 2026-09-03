import type { DatabaseMigration } from "@/migrations/database/types";

/**
 * M8.11.8 — one compact integrated report per trading day.
 * The report stores already-computed text/JSON only; it does not duplicate the
 * underlying market / Early Watch / Swing10 history tables.
 */
export const dailyIntegratedReportMigration: DatabaseMigration = {
  version: 37,
  name: "daily_integrated_report_m8118",
  async up(transaction) {
    await transaction.execute({ sql: `CREATE TABLE IF NOT EXISTS daily_analysis_reports (
      report_date TEXT PRIMARY KEY,
      report_json TEXT NOT NULL,
      summary_text TEXT NOT NULL,
      source_dates_json TEXT NOT NULL DEFAULT '{}',
      version TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )` });
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_daily_analysis_reports_generated ON daily_analysis_reports(report_date DESC,generated_at DESC)" });
  },
};
