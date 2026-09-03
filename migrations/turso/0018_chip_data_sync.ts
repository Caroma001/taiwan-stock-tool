import type { DatabaseMigration } from "@/migrations/database/types";

export const createChipDataSyncMigration: DatabaseMigration = {
  version: 18,
  name: "create_chip_data_sync",
  async up(transaction) {
    await transaction.execute({ sql: `CREATE TABLE IF NOT EXISTS chip_data_sync_runs (
      id TEXT PRIMARY KEY,
      sync_type TEXT NOT NULL,
      status TEXT NOT NULL,
      requested_symbols INTEGER NOT NULL DEFAULT 0,
      processed_symbols INTEGER NOT NULL DEFAULT 0,
      success_symbols INTEGER NOT NULL DEFAULT 0,
      failed_symbols INTEGER NOT NULL DEFAULT 0,
      current_symbol TEXT,
      last_error TEXT,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    )` });
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_chip_sync_runs_type_time ON chip_data_sync_runs(sync_type,started_at DESC)" });
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_institutional_symbol_date ON institutional_holding_daily(symbol,trade_date DESC)" });
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_distribution_symbol_date ON shareholding_distribution_weekly(symbol,report_date DESC)" });
  },
};
