import type { DatabaseMigration } from "@/migrations/database/types";

/**
 * M8.10.24 — Risk & Margin Intelligence
 *
 * Deliberately uses new tables only and never modifies existing table shapes. This keeps deployment
 * self-contained and avoids schema drift on existing M8.10.23 installations.
 *
 * Read budget design:
 * - public_risk_snapshot_runs: one row per trading date, so official TWSE/TPEx
 *   endpoints are fetched at most once per day.
 * - market_microstructure_daily: compact rolling margin/day-trade history for the current Top40 candidate pool only.
 * - market_index_daily: only market indices (normally TAIEX).
 * - risk_intelligence_latest: exactly one precomputed row per stock. The Stealth
 *   page reads only Top40 rows instead of recomputing history on every page load.
 */
export const riskMarginIntelligenceMigration: DatabaseMigration = {
  version: 33,
  name: "risk_margin_intelligence_m81024",
  async up(transaction) {
    await transaction.execute({ sql: `CREATE TABLE IF NOT EXISTS public_risk_snapshot_runs (
      trade_date TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'waiting',
      engine_version TEXT NOT NULL DEFAULT 'M8.10.24',
      margin_rows INTEGER NOT NULL DEFAULT 0,
      daytrade_rows INTEGER NOT NULL DEFAULT 0,
      index_rows INTEGER NOT NULL DEFAULT 0,
      external_requests INTEGER NOT NULL DEFAULT 0,
      successful_requests INTEGER NOT NULL DEFAULT 0,
      source_json TEXT NOT NULL DEFAULT '{}',
      last_error TEXT,
      lease_token TEXT,
      lease_until TEXT,
      started_at TEXT,
      completed_at TEXT,
      updated_at TEXT NOT NULL
    )` });

    await transaction.execute({ sql: `CREATE TABLE IF NOT EXISTS market_microstructure_daily (
      symbol TEXT NOT NULL,
      trade_date TEXT NOT NULL,
      margin_prev_balance REAL,
      margin_buy REAL,
      margin_sell REAL,
      margin_cash_repay REAL,
      margin_balance REAL,
      margin_utilization_pct REAL,
      short_prev_balance REAL,
      short_sell REAL,
      short_buy REAL,
      short_repay REAL,
      short_balance REAL,
      daytrade_volume REAL,
      daytrade_buy_value REAL,
      daytrade_sell_value REAL,
      margin_source TEXT,
      daytrade_source TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (symbol, trade_date)
    )` });

    await transaction.execute({
      sql: "CREATE INDEX IF NOT EXISTS idx_microstructure_date_symbol ON market_microstructure_daily(trade_date DESC,symbol)",
    });

    await transaction.execute({ sql: `CREATE TABLE IF NOT EXISTS market_index_daily (
      index_code TEXT NOT NULL,
      trade_date TEXT NOT NULL,
      display_name TEXT NOT NULL,
      close REAL,
      change_pct REAL,
      source TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (index_code, trade_date)
    )` });

    await transaction.execute({
      sql: "CREATE INDEX IF NOT EXISTS idx_market_index_date ON market_index_daily(index_code,trade_date DESC)",
    });

    await transaction.execute({ sql: `CREATE TABLE IF NOT EXISTS risk_intelligence_latest (
      symbol TEXT PRIMARY KEY,
      trade_date TEXT NOT NULL,
      base_potential_score REAL,
      decision_score REAL,
      decision_modifier REAL NOT NULL DEFAULT 0,
      market_risk_score REAL,
      market_risk_level TEXT,
      market_risk_modifier REAL NOT NULL DEFAULT 0,
      beta_proxy REAL,
      margin_washout_score REAL,
      margin_change_1d_pct REAL,
      margin_change_5d_pct REAL,
      margin_change_10d_pct REAL,
      margin_modifier REAL NOT NULL DEFAULT 0,
      foreign_persistence_score REAL,
      foreign_1d_share_5d_pct REAL,
      foreign_modifier REAL NOT NULL DEFAULT 0,
      daytrade_ratio_pct REAL,
      daytrade_noise_penalty REAL NOT NULL DEFAULT 0,
      data_confidence_pct REAL NOT NULL DEFAULT 0,
      reasons_json TEXT NOT NULL DEFAULT '[]',
      source_json TEXT NOT NULL DEFAULT '{}',
      calculated_at TEXT NOT NULL
    )` });

    await transaction.execute({
      sql: "CREATE INDEX IF NOT EXISTS idx_risk_intelligence_score ON risk_intelligence_latest(trade_date,decision_score DESC)",
    });
  },
};
