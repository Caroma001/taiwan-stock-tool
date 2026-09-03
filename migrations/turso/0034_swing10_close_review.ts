import type { DatabaseMigration } from "@/migrations/database/types";

/**
 * M8.10.26 — Swing10 Close Review
 *
 * Purpose: observe a 5–10 trading-day swing setup without changing the
 * validated Winner25 / Stealth / Risk Intelligence engines.
 *
 * Read/write budget:
 * - swing10_candidate_daily stores only the top 20 observation rows/day.
 * - swing10_daily_review stores exactly one row/day.
 * - no full-market history is duplicated here.
 */
export const swing10CloseReviewMigration: DatabaseMigration = {
  version: 34,
  name: "swing10_close_review_m81026",
  async up(transaction) {
    await transaction.execute({ sql: `CREATE TABLE IF NOT EXISTS swing10_candidate_daily (
      trade_date TEXT NOT NULL,
      symbol TEXT NOT NULL,
      stock_name TEXT,
      candidate_rank INTEGER NOT NULL,
      grade TEXT NOT NULL DEFAULT 'C',
      swing10_score REAL NOT NULL DEFAULT 0,
      decision_score REAL,
      potential_score REAL,
      stealth_score REAL,
      breakout_score REAL,
      trigger_score REAL,
      decision_delta_1d REAL,
      decision_delta_3d REAL,
      rank_delta_1d INTEGER,
      market_risk_level TEXT,
      market_risk_score REAL,
      market_risk_delta_1d REAL,
      margin_washout_score REAL,
      margin_washout_delta_1d REAL,
      foreign_persistence_score REAL,
      foreign_persistence_delta_1d REAL,
      daytrade_ratio_pct REAL,
      daytrade_noise_penalty REAL,
      daytrade_noise_delta_1d REAL,
      risk_data_confidence_pct REAL,
      price20_pct REAL,
      entry_gate_pass INTEGER NOT NULL DEFAULT 0,
      risk_change_level TEXT NOT NULL DEFAULT 'stable',
      risk_change_json TEXT NOT NULL DEFAULT '[]',
      reasons_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (trade_date, symbol)
    )` });

    await transaction.execute({
      sql: "CREATE INDEX IF NOT EXISTS idx_swing10_daily_grade ON swing10_candidate_daily(trade_date DESC,grade,candidate_rank)",
    });

    await transaction.execute({ sql: `CREATE TABLE IF NOT EXISTS swing10_daily_review (
      trade_date TEXT PRIMARY KEY,
      snapshot_status TEXT NOT NULL DEFAULT 'ready',
      candidate_count INTEGER NOT NULL DEFAULT 0,
      a_grade_count INTEGER NOT NULL DEFAULT 0,
      risk_changed_count INTEGER NOT NULL DEFAULT 0,
      snapshot_fingerprint TEXT,
      reviewed INTEGER NOT NULL DEFAULT 0,
      reviewed_at TEXT,
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )` });
  },
};
