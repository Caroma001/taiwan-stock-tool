import type { DatabaseMigration } from "@/migrations/database/types";

export const createForeignAccumulationMigration: DatabaseMigration = {
  version: 14,
  name: "create_foreign_accumulation_data",
  async up(transaction) {
    await transaction.execute({ sql: `CREATE TABLE IF NOT EXISTS foreign_investor_daily (
      symbol TEXT NOT NULL,
      trade_date TEXT NOT NULL,
      net_buy_shares REAL NOT NULL DEFAULT 0,
      buy_shares REAL,
      sell_shares REAL,
      source TEXT NOT NULL DEFAULT 'institutional',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (symbol, trade_date),
      FOREIGN KEY (symbol) REFERENCES stocks(symbol)
    )` });
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_foreign_daily_date ON foreign_investor_daily(trade_date)" });
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_foreign_daily_symbol_date ON foreign_investor_daily(symbol,trade_date DESC)" });
  },
};
