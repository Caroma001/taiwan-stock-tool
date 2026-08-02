import type { DatabaseMigration } from "@/migrations/database/types";
import type { DatabaseTransaction } from "@/lib/database";

async function existingColumns(transaction: DatabaseTransaction, table: string): Promise<Set<string>> {
  const result = await transaction.execute({ sql: `PRAGMA table_info(${table})` });
  return new Set(result.rows.map((row) => String(row.name ?? "")));
}

async function addMissingColumns(
  transaction: DatabaseTransaction,
  table: string,
  columns: ReadonlyArray<readonly [name: string, definition: string]>,
): Promise<void> {
  const current = await existingColumns(transaction, table);
  for (const [name, definition] of columns) {
    if (current.has(name)) continue;
    await transaction.execute({ sql: `ALTER TABLE ${table} ADD COLUMN ${name} ${definition}` });
    current.add(name);
  }
}

/**
 * M7.4.3 repairs partially-applied M7.4 schema upgrades.
 *
 * Some databases already recorded migration 6 while one or more ALTER TABLE
 * statements were missing. This migration is intentionally idempotent: it
 * inspects the actual schema and only adds absent columns.
 */
export const repairAlgorithmicSchemaMigration: DatabaseMigration = {
  version: 7,
  name: "repair_algorithmic_market_schema",
  async up(transaction) {
    await addMissingColumns(transaction, "ai_analysis_latest", [
      ["raw_score", "REAL"],
      ["market_adjustment", "REAL NOT NULL DEFAULT 0"],
      ["final_score", "REAL"],
      ["market_score", "REAL NOT NULL DEFAULT 50"],
      ["market_regime", "TEXT NOT NULL DEFAULT '盤整'"],
      ["algorithm_version", "TEXT NOT NULL DEFAULT 'RULES-1'"],
    ]);

    await addMissingColumns(transaction, "decision_latest", [
      ["market_score", "REAL NOT NULL DEFAULT 50"],
      ["market_regime", "TEXT NOT NULL DEFAULT '盤整'"],
      ["algorithm_version", "TEXT NOT NULL DEFAULT 'RULES-1'"],
    ]);

    await addMissingColumns(transaction, "top30_snapshots", [
      ["raw_score", "REAL"],
      ["market_adjustment", "REAL NOT NULL DEFAULT 0"],
      ["market_score", "REAL NOT NULL DEFAULT 50"],
      ["market_regime", "TEXT NOT NULL DEFAULT '盤整'"],
      ["algorithm_version", "TEXT NOT NULL DEFAULT 'RULES-1'"],
    ]);

    await addMissingColumns(transaction, "validation_snapshots", [
      ["max_gain_pct", "REAL"],
      ["max_drawdown_pct", "REAL"],
      ["trading_days", "INTEGER NOT NULL DEFAULT 0"],
      ["entry_market_score", "REAL"],
      ["entry_market_regime", "TEXT"],
      ["entry_ai_score", "REAL"],
      ["algorithm_version", "TEXT NOT NULL DEFAULT 'RULES-1'"],
    ]);

    await transaction.execute({
      sql: `UPDATE ai_analysis_latest
            SET raw_score = COALESCE(raw_score, total_score),
                final_score = COALESCE(final_score, total_score),
                market_adjustment = COALESCE(market_adjustment, 0),
                market_score = COALESCE(market_score, 50),
                market_regime = COALESCE(market_regime, '盤整'),
                algorithm_version = COALESCE(algorithm_version, 'RULES-1')`,
    });

    await transaction.execute({
      sql: `UPDATE top30_snapshots
            SET raw_score = COALESCE(raw_score, total_score),
                market_adjustment = COALESCE(market_adjustment, 0),
                market_score = COALESCE(market_score, 50),
                market_regime = COALESCE(market_regime, '盤整'),
                algorithm_version = COALESCE(algorithm_version, 'RULES-1')`,
    });

    await transaction.execute({
      sql: `CREATE TABLE IF NOT EXISTS algorithm_settings (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        algorithm_version TEXT NOT NULL,
        validation_horizon_days INTEGER NOT NULL DEFAULT 10,
        weights_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    });
    await transaction.execute({
      sql: `INSERT OR IGNORE INTO algorithm_settings(id,algorithm_version,validation_horizon_days,weights_json,updated_at)
            VALUES(1,'RULES-1',10,'{"trend":0.30,"momentum":0.25,"volume":0.20,"risk":0.25,"market":true}',CURRENT_TIMESTAMP)`,
    });
    await transaction.execute({
      sql: `CREATE TABLE IF NOT EXISTS validation_metrics_daily (
        metric_date TEXT PRIMARY KEY,
        total_samples INTEGER NOT NULL DEFAULT 0,
        active_samples INTEGER NOT NULL DEFAULT 0,
        completed_samples INTEGER NOT NULL DEFAULT 0,
        winning_samples INTEGER NOT NULL DEFAULT 0,
        win_rate REAL NOT NULL DEFAULT 0,
        average_return REAL NOT NULL DEFAULT 0,
        average_max_gain REAL NOT NULL DEFAULT 0,
        average_max_drawdown REAL NOT NULL DEFAULT 0,
        market_regime TEXT,
        algorithm_version TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    });
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_analysis_final_score ON ai_analysis_latest(final_score DESC)" });
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_validation_lot_date ON validation_snapshots(lot_id,snapshot_date DESC)" });
  },
};
