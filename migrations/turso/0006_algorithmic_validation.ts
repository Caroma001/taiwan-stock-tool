import type { DatabaseMigration } from "@/migrations/database/types";

export const createAlgorithmicValidationMigration: DatabaseMigration = {
  version: 6,
  name: "algorithmic_market_scoring_validation",
  async up(transaction) {
    const statements = [
      `ALTER TABLE ai_analysis_latest ADD COLUMN raw_score REAL`,
      `ALTER TABLE ai_analysis_latest ADD COLUMN market_adjustment REAL`,
      `ALTER TABLE ai_analysis_latest ADD COLUMN final_score REAL`,
      `ALTER TABLE ai_analysis_latest ADD COLUMN market_score REAL`,
      `ALTER TABLE ai_analysis_latest ADD COLUMN market_regime TEXT`,
      `ALTER TABLE ai_analysis_latest ADD COLUMN algorithm_version TEXT`,
      `ALTER TABLE decision_latest ADD COLUMN market_score REAL`,
      `ALTER TABLE decision_latest ADD COLUMN market_regime TEXT`,
      `ALTER TABLE decision_latest ADD COLUMN algorithm_version TEXT`,
      `ALTER TABLE top30_snapshots ADD COLUMN raw_score REAL`,
      `ALTER TABLE top30_snapshots ADD COLUMN market_adjustment REAL`,
      `ALTER TABLE top30_snapshots ADD COLUMN market_score REAL`,
      `ALTER TABLE top30_snapshots ADD COLUMN market_regime TEXT`,
      `ALTER TABLE top30_snapshots ADD COLUMN algorithm_version TEXT`,
      `ALTER TABLE validation_snapshots ADD COLUMN max_gain_pct REAL`,
      `ALTER TABLE validation_snapshots ADD COLUMN max_drawdown_pct REAL`,
      `ALTER TABLE validation_snapshots ADD COLUMN trading_days INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE validation_snapshots ADD COLUMN entry_market_score REAL`,
      `ALTER TABLE validation_snapshots ADD COLUMN entry_market_regime TEXT`,
      `ALTER TABLE validation_snapshots ADD COLUMN entry_ai_score REAL`,
      `ALTER TABLE validation_snapshots ADD COLUMN algorithm_version TEXT`,
      `CREATE TABLE IF NOT EXISTS algorithm_settings (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        algorithm_version TEXT NOT NULL,
        validation_horizon_days INTEGER NOT NULL DEFAULT 10,
        weights_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `INSERT OR IGNORE INTO algorithm_settings(id,algorithm_version,validation_horizon_days,weights_json,updated_at)
       VALUES(1,'RULES-1',10,'{"trend":0.30,"momentum":0.25,"volume":0.20,"risk":0.25,"market":true}',CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS validation_metrics_daily (
        metric_date TEXT PRIMARY KEY,
        total_samples INTEGER NOT NULL DEFAULT 0,
        active_samples INTEGER NOT NULL DEFAULT 0,
        completed_samples INTEGER NOT NULL DEFAULT 0,
        winning_samples INTEGER NOT NULL DEFAULT 0,
        win_rate REAL NOT NULL DEFAULT 0,
        average_return REAL NOT NULL DEFAULT 0,
        average_max_gain REAL NOT NULL DEFAULT 0,
        average_max_drawdown REAL NOT NULL DEFAULT 0,
        market_regime TEXT,
        algorithm_version TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_validation_lot_date ON validation_snapshots(lot_id,snapshot_date DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_analysis_final_score ON ai_analysis_latest(final_score DESC)`,
    ];
    for (const sql of statements) await transaction.execute({ sql });
  },
};
