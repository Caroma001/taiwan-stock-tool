import type { DatabaseMigration } from "@/migrations/database/types";
import type { DatabaseTransaction } from "@/lib/database";

/**
 * M8.10.4.2
 * Store today's Winner25/Breakout score separately from ai_analysis_latest.
 * This avoids losing live scores when ai_analysis_latest has not yet been created
 * for a symbol by another pipeline.
 */
export const createWinner25LiveScoringMigration: DatabaseMigration = {
  version: 22,
  name: "winner25_live_scoring_m81042",
  async up(transaction: DatabaseTransaction) {
    await transaction.execute({ sql: `CREATE TABLE IF NOT EXISTS winner25_live_scores (
      symbol TEXT PRIMARY KEY,
      as_of_date TEXT NOT NULL,
      model_run_id TEXT,
      model_active INTEGER NOT NULL DEFAULT 0,
      breakout_score REAL,
      feature_count INTEGER NOT NULL DEFAULT 0,
      required_feature_count INTEGER NOT NULL DEFAULT 0,
      reasons_json TEXT NOT NULL DEFAULT '[]',
      missing_json TEXT NOT NULL DEFAULT '[]',
      features_json TEXT NOT NULL DEFAULT '{}',
      stealth_score REAL,
      stealth_foreign_score REAL,
      stealth_trust_score REAL,
      stealth_pullback_score REAL,
      stealth_ownership_score REAL,
      stealth_trigger_score REAL,
      stealth_confidence_pct REAL,
      stealth_stage TEXT,
      stealth_reasons_json TEXT NOT NULL DEFAULT '[]',
      calculated_at TEXT NOT NULL
    )` });
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_w25_live_score ON winner25_live_scores(breakout_score DESC)" });
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_w25_live_model ON winner25_live_scores(model_active,model_run_id)" });
  },
};
