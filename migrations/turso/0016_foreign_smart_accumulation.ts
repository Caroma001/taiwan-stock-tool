import type { DatabaseMigration } from "@/migrations/database/types";

export const createForeignSmartAccumulationMigration: DatabaseMigration = {
  version: 16,
  name: "create_foreign_smart_accumulation",
  async up(transaction) {
    await transaction.execute({ sql: `CREATE TABLE IF NOT EXISTS foreign_accumulation_latest (
      symbol TEXT PRIMARY KEY,
      trade_date TEXT,
      data_days INTEGER NOT NULL DEFAULT 0,
      foreign_5 REAL,
      foreign_10 REAL,
      foreign_20 REAL,
      foreign_60 REAL,
      buy_days_5 INTEGER NOT NULL DEFAULT 0,
      buy_days_10 INTEGER NOT NULL DEFAULT 0,
      buy_days_20 INTEGER NOT NULL DEFAULT 0,
      buy_days_60 INTEGER NOT NULL DEFAULT 0,
      price_5_pct REAL,
      price_10_pct REAL,
      price_20_pct REAL,
      price_60_pct REAL,
      amount_score REAL NOT NULL DEFAULT 0,
      consistency_score REAL NOT NULL DEFAULT 0,
      muted_price_score REAL NOT NULL DEFAULT 0,
      acceleration_score REAL NOT NULL DEFAULT 0,
      absorption_score REAL NOT NULL DEFAULT 0,
      accumulation_score REAL NOT NULL DEFAULT 0,
      stars INTEGER NOT NULL DEFAULT 0,
      signal TEXT NOT NULL DEFAULT '資料不足',
      reasons_json TEXT NOT NULL DEFAULT '[]',
      calculated_at TEXT NOT NULL,
      FOREIGN KEY (symbol) REFERENCES stocks(symbol)
    )` });
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_foreign_accumulation_score ON foreign_accumulation_latest(accumulation_score DESC)" });
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_foreign_accumulation_date ON foreign_accumulation_latest(trade_date DESC)" });

    await transaction.execute({ sql: `CREATE TABLE IF NOT EXISTS foreign_accumulation_runs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'priority',
      total_symbols INTEGER NOT NULL DEFAULT 0,
      processed_symbols INTEGER NOT NULL DEFAULT 0,
      success_symbols INTEGER NOT NULL DEFAULT 0,
      failed_symbols INTEGER NOT NULL DEFAULT 0,
      current_symbol TEXT,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      last_error TEXT
    )` });
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_foreign_accumulation_runs_started ON foreign_accumulation_runs(started_at DESC)" });
  },
};
