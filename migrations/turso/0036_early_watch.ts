import type { DatabaseMigration } from "@/migrations/database/types";

/**
 * M8.11.4 — Early Watch / Catalyst selection layer.
 *
 * Design goals:
 * - add a pre-Swing10 observation layer without changing the validated Swing10 tables;
 * - ingest only the latest public monthly-revenue snapshots (listed/OTC) and keep one row per month/company;
 * - persist only the best Early Watch candidates each trading day;
 * - allow lightweight catalyst annotations without scraping news or creating high-frequency API traffic.
 */
export const earlyWatchMigration: DatabaseMigration = {
  version: 36,
  name: "early_watch_catalyst_m8114",
  async up(transaction) {
    await transaction.execute({ sql: `CREATE TABLE IF NOT EXISTS monthly_revenue_history (
      symbol TEXT NOT NULL,
      data_month TEXT NOT NULL,
      stock_name TEXT,
      market TEXT NOT NULL DEFAULT 'unknown',
      industry TEXT,
      current_revenue REAL,
      previous_month_revenue REAL,
      last_year_revenue REAL,
      mom_pct REAL,
      yoy_pct REAL,
      cumulative_revenue REAL,
      cumulative_last_year_revenue REAL,
      cumulative_yoy_pct REAL,
      source TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY(symbol,data_month)
    )` });
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_monthly_revenue_month_yoy ON monthly_revenue_history(data_month DESC,yoy_pct DESC)" });

    await transaction.execute({ sql: `CREATE TABLE IF NOT EXISTS early_watch_catalyst_events (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      event_date TEXT NOT NULL,
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      score REAL NOT NULL DEFAULT 0,
      source_url TEXT,
      note TEXT,
      active_until TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )` });
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_early_watch_catalyst_symbol_date ON early_watch_catalyst_events(symbol,event_date DESC)" });

    await transaction.execute({ sql: `CREATE TABLE IF NOT EXISTS early_watch_daily (
      trade_date TEXT NOT NULL,
      symbol TEXT NOT NULL,
      stock_name TEXT,
      candidate_rank INTEGER NOT NULL,
      tier TEXT NOT NULL,
      early_watch_score REAL NOT NULL,
      fundamental_score REAL NOT NULL DEFAULT 0,
      catalyst_score REAL NOT NULL DEFAULT 0,
      price_not_priced_score REAL NOT NULL DEFAULT 0,
      accumulation_score REAL NOT NULL DEFAULT 0,
      technical_setup_score REAL NOT NULL DEFAULT 0,
      revenue_data_month TEXT,
      revenue_yoy_pct REAL,
      revenue_mom_pct REAL,
      revenue_cumulative_yoy_pct REAL,
      revenue_yoy_acceleration REAL,
      price_20_pct REAL,
      foreign_20 REAL,
      foreign_buy_days_20 INTEGER,
      muted_price_score REAL,
      foreign_acceleration_score REAL,
      catalyst_count INTEGER NOT NULL DEFAULT 0,
      catalyst_json TEXT NOT NULL DEFAULT '[]',
      reasons_json TEXT NOT NULL DEFAULT '[]',
      source_confidence_pct REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(trade_date,symbol)
    )` });
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_early_watch_daily_rank ON early_watch_daily(trade_date DESC,candidate_rank)" });
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_early_watch_daily_score ON early_watch_daily(trade_date DESC,early_watch_score DESC)" });

    await transaction.execute({ sql: `CREATE TABLE IF NOT EXISTS early_watch_refresh_runs (
      trade_date TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'waiting',
      revenue_data_month TEXT,
      revenue_rows INTEGER NOT NULL DEFAULT 0,
      candidate_rows INTEGER NOT NULL DEFAULT 0,
      external_requests INTEGER NOT NULL DEFAULT 0,
      source_json TEXT NOT NULL DEFAULT '{}',
      last_error TEXT,
      started_at TEXT,
      completed_at TEXT,
      updated_at TEXT NOT NULL
    )` });
  },
};
