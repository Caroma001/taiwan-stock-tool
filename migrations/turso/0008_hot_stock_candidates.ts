import type { DatabaseMigration } from "@/migrations/database/types";

export const createHotStockCandidatesMigration: DatabaseMigration = {
  version: 8,
  name: "create_hot_stock_candidates",
  async up(transaction) {
    await transaction.execute({
      sql: `CREATE TABLE IF NOT EXISTS hot_stock_candidates (
        symbol TEXT PRIMARY KEY,
        source TEXT NOT NULL DEFAULT 'manual',
        reason TEXT,
        status TEXT NOT NULL DEFAULT 'waiting',
        last_error TEXT,
        added_at TEXT NOT NULL,
        analyzed_at TEXT,
        updated_at TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (symbol) REFERENCES stocks(symbol)
      )`,
    });
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_hot_stock_status ON hot_stock_candidates(status,updated_at DESC)" });
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_hot_stock_active ON hot_stock_candidates(is_active,added_at DESC)" });
  },
};
