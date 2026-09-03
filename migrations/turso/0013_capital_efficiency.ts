import type { DatabaseMigration } from "@/migrations/database/types";

export const createCapitalEfficiencyMigration: DatabaseMigration = {
  version: 13,
  name: "add_hot_stock_positions_and_advice_events",
  async up(transaction) {
    await transaction.execute({ sql: "ALTER TABLE hot_stock_candidates ADD COLUMN position_type TEXT NOT NULL DEFAULT 'watch'" });
    await transaction.execute({ sql: "ALTER TABLE hot_stock_candidates ADD COLUMN average_cost REAL" });
    await transaction.execute({ sql: "ALTER TABLE hot_stock_candidates ADD COLUMN quantity REAL" });
    await transaction.execute({ sql: "ALTER TABLE hot_stock_candidates ADD COLUMN purchase_date TEXT" });
    await transaction.execute({ sql: "ALTER TABLE hot_stock_candidates ADD COLUMN previous_action_advice TEXT" });
    await transaction.execute({
      sql: `CREATE TABLE IF NOT EXISTS position_advice_events (
        id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        advised_at TEXT NOT NULL,
        model_version TEXT NOT NULL,
        previous_advice TEXT,
        new_advice TEXT NOT NULL,
        close REAL,
        average_cost REAL,
        unrealized_return REAL,
        position_health TEXT NOT NULL,
        capital_efficiency TEXT NOT NULL,
        action_price REAL,
        replacement_symbol TEXT,
        reasons_json TEXT NOT NULL DEFAULT '[]',
        FOREIGN KEY (symbol) REFERENCES stocks(symbol)
      )`,
    });
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_position_advice_symbol_date ON position_advice_events(symbol,advised_at DESC)" });
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_hot_stock_position_type ON hot_stock_candidates(position_type,is_active,added_at DESC)" });
  },
};
