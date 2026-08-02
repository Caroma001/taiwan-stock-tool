import type { DatabaseMigration } from "@/migrations/database/types";

export const createMarketValidationMigration: DatabaseMigration = {
  version: 5,
  name: "create_market_validation",
  async up(transaction) {
    const statements = [
      `CREATE TABLE IF NOT EXISTS market_quotes_daily (
        symbol TEXT NOT NULL,
        quote_date TEXT NOT NULL,
        display_name TEXT NOT NULL,
        category TEXT NOT NULL,
        close REAL,
        previous_close REAL,
        change_pct REAL,
        currency TEXT,
        source TEXT NOT NULL DEFAULT 'yahoo',
        updated_at TEXT NOT NULL,
        PRIMARY KEY (symbol, quote_date)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_market_quotes_date ON market_quotes_daily(quote_date DESC, category)`,
      `CREATE TABLE IF NOT EXISTS market_regime_daily (
        regime_date TEXT PRIMARY KEY,
        market_score REAL NOT NULL,
        market_factor REAL NOT NULL,
        regime TEXT NOT NULL,
        risk_level TEXT NOT NULL,
        confidence REAL NOT NULL,
        reasons_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS validation_snapshots (
        snapshot_date TEXT NOT NULL,
        lot_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        buy_date TEXT NOT NULL,
        entry_price REAL NOT NULL,
        current_price REAL,
        return_pct REAL,
        highest_price REAL,
        lowest_price REAL,
        target_1 REAL,
        target_2 REAL,
        stop_loss REAL,
        result_status TEXT NOT NULL,
        market_score REAL,
        market_regime TEXT,
        ai_score REAL,
        confidence REAL,
        holding_days INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (snapshot_date, lot_id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_validation_symbol_date ON validation_snapshots(symbol, snapshot_date DESC)`
    ];
    for (const sql of statements) await transaction.execute({ sql });
  },
};
