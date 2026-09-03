import type { DatabaseMigration } from "@/migrations/database/types";

/**
 * M8.10.20 — High Efficiency Daily Snapshot Engine
 * One compact row per trading date records the market-wide network snapshot.
 * The worker checks this row before any per-symbol analysis, so repeated Queue
 * slices never refetch the same market day from upstream providers.
 */
export const bulkDailySnapshotMigration: DatabaseMigration = {
  version: 30,
  name: "bulk_daily_snapshot_m81020",
  async up(transaction) {
    await transaction.execute({ sql: `CREATE TABLE IF NOT EXISTS daily_bulk_snapshot_runs (
      trade_date TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'waiting',
      engine_version TEXT NOT NULL DEFAULT 'M8.10.20',
      price_source TEXT,
      institutional_source TEXT,
      price_rows INTEGER NOT NULL DEFAULT 0,
      institutional_rows INTEGER NOT NULL DEFAULT 0,
      accumulation_rows INTEGER NOT NULL DEFAULT 0,
      allowed_symbols INTEGER NOT NULL DEFAULT 0,
      external_requests INTEGER NOT NULL DEFAULT 0,
      finmind_requests INTEGER NOT NULL DEFAULT 0,
      official_requests INTEGER NOT NULL DEFAULT 0,
      lease_token TEXT,
      lease_until TEXT,
      next_retry_at TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      started_at TEXT,
      completed_at TEXT,
      updated_at TEXT NOT NULL,
      last_error TEXT
    )` });
    await transaction.execute({
      sql: "CREATE INDEX IF NOT EXISTS idx_bulk_snapshot_status ON daily_bulk_snapshot_runs(status,updated_at)",
    });
  },
};
