import type { DatabaseMigration } from "./types";

export const createStocksMigration: DatabaseMigration = {
  version: 1,
  name: "create_stocks",
  async up(transaction) {
    await transaction.execute({
      sql: `CREATE TABLE IF NOT EXISTS stocks (
              symbol TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              market TEXT NOT NULL,
              industry TEXT,
              is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
              updated_at TEXT NOT NULL
            )`,
    });
    await transaction.execute({
      sql: "CREATE INDEX IF NOT EXISTS idx_stocks_market_active ON stocks (market, is_active)",
    });
  },
};
