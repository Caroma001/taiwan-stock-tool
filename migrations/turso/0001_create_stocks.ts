import type { DatabaseMigration } from "@/migrations/database/types";

export const createTursoStocksMigration: DatabaseMigration = {
  version: 1,
  name: "create_turso_stocks",
  async up(transaction) {
    await transaction.execute({
      sql: `CREATE TABLE IF NOT EXISTS stocks (
        symbol TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        market TEXT NOT NULL,
        industry TEXT,
        sector TEXT,
        capital REAL,
        shares_outstanding REAL,
        listed_date TEXT,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        price_sync_status TEXT,
        price_sync_started_at TEXT,
        price_sync_completed_at TEXT,
        price_sync_error TEXT
      )`,
    });
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_stocks_market_active ON stocks (market, is_active)" });
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_stocks_industry ON stocks (industry)" });
    await transaction.execute({
      sql: `CREATE TABLE IF NOT EXISTS stock_import_runs (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        status TEXT NOT NULL,
        imported_count INTEGER NOT NULL DEFAULT 0,
        last_symbol TEXT,
        started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        error TEXT
      )`,
    });
  },
};
