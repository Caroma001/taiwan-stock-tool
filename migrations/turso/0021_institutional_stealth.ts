import type { DatabaseMigration } from "@/migrations/database/types";
import type { DatabaseTransaction } from "@/lib/database";

async function addColumn(transaction: DatabaseTransaction, sql: string) {
  try { await transaction.execute({ sql }); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/duplicate column|already exists/i.test(message)) throw error;
  }
}

export const createInstitutionalStealthMigration: DatabaseMigration = {
  version: 21,
  name: "institutional_stealth_scanner_m8104",
  async up(transaction) {
    const columns = [
      "ALTER TABLE ai_analysis_latest ADD COLUMN stealth_score REAL",
      "ALTER TABLE ai_analysis_latest ADD COLUMN stealth_foreign_score REAL",
      "ALTER TABLE ai_analysis_latest ADD COLUMN stealth_trust_score REAL",
      "ALTER TABLE ai_analysis_latest ADD COLUMN stealth_pullback_score REAL",
      "ALTER TABLE ai_analysis_latest ADD COLUMN stealth_ownership_score REAL",
      "ALTER TABLE ai_analysis_latest ADD COLUMN stealth_trigger_score REAL",
      "ALTER TABLE ai_analysis_latest ADD COLUMN stealth_confidence_pct REAL",
      "ALTER TABLE ai_analysis_latest ADD COLUMN stealth_stage TEXT",
      "ALTER TABLE ai_analysis_latest ADD COLUMN stealth_reasons_json TEXT NOT NULL DEFAULT '[]'",
      "ALTER TABLE ai_analysis_latest ADD COLUMN stealth_calculated_at TEXT",
    ];
    for (const sql of columns) await addColumn(transaction, sql);
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_ai_stealth_score ON ai_analysis_latest(stealth_score DESC)" });
  },
};
