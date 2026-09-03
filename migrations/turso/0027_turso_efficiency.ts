import type { DatabaseMigration } from "@/migrations/database/types";

/**
 * M8.10.9 — Turso Efficiency Edition
 *
 * Design goals:
 * 1. Persist hot-path checkpoints instead of repeatedly aggregating historical tables.
 * 2. Keep status/queue lookups index-backed.
 * 3. Avoid building new indexes on the very large daily_prices table during upgrade;
 *    its (symbol, trade_date) primary key already covers the hot price-history reads.
 */
export const tursoEfficiencyMigration: DatabaseMigration = {
  version: 27,
  name: "turso_efficiency_m8109",
  async up(transaction) {
    await transaction.execute({ sql: `CREATE TABLE IF NOT EXISTS stock_sync_checkpoint (
      symbol TEXT PRIMARY KEY,
      price_latest_date TEXT,
      foreign_latest_date TEXT,
      foreign_data_days INTEGER NOT NULL DEFAULT 0,
      last_full_refresh_at TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(symbol) REFERENCES stocks(symbol)
    )` });

    await transaction.execute({ sql: `CREATE TABLE IF NOT EXISTS app_runtime_cache (
      cache_key TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      expires_at TEXT
    )` });

    // cloud_update_items is intentionally small per job, but this exact queue index
    // avoids planner fallbacks while the worker repeatedly selects the next batch.
    await transaction.execute({
      sql: "CREATE INDEX IF NOT EXISTS idx_cloud_items_hot_queue ON cloud_update_items(job_id,status,attempts,next_attempt_at,symbol)",
    });

    // These tables are small (roughly one row per stock/run). The indexes are cheap
    // to add and remove full scans from frequently opened status/read-only pages.
    await transaction.execute({
      sql: "CREATE INDEX IF NOT EXISTS idx_indicator_latest_trade_date ON indicator_latest(trade_date DESC)",
    });
    await transaction.execute({
      sql: "CREATE INDEX IF NOT EXISTS idx_market_pipeline_runs_started ON market_pipeline_runs(started_at DESC)",
    });
    await transaction.execute({
      sql: "CREATE INDEX IF NOT EXISTS idx_winner25_runs_completed ON winner25_runs(status,completed_at DESC)",
    });
    await transaction.execute({
      sql: "CREATE INDEX IF NOT EXISTS idx_runtime_cache_expiry ON app_runtime_cache(expires_at)",
    });
  },
};
