import type { DatabaseMigration } from "@/migrations/database/types";

export const createStockImportAuditMigration: DatabaseMigration = {
  version: 2,
  name: "create_stock_import_audit",
  async up(transaction) {
    await transaction.execute({
      sql: `CREATE TABLE IF NOT EXISTS stock_import_audit (
        run_id TEXT NOT NULL,
        checked_at TEXT NOT NULL,
        source_count INTEGER NOT NULL,
        target_count INTEGER NOT NULL,
        sample_size INTEGER NOT NULL,
        sample_passed INTEGER NOT NULL CHECK (sample_passed IN (0, 1)),
        source_min_symbol TEXT,
        source_max_symbol TEXT,
        target_min_symbol TEXT,
        target_max_symbol TEXT,
        message TEXT,
        PRIMARY KEY (run_id, checked_at)
      )`,
    });
    await transaction.execute({
      sql: "CREATE INDEX IF NOT EXISTS idx_stock_import_audit_checked_at ON stock_import_audit (checked_at DESC)",
    });
  },
};
