import type { DatabaseMigration } from "@/migrations/database/types";
export const createOwnershipStructureMigration: DatabaseMigration = {
  version: 17,
  name: "create_ownership_structure",
  async up(transaction) {
    await transaction.execute({ sql: `CREATE TABLE IF NOT EXISTS shareholding_distribution_weekly (
      symbol TEXT NOT NULL, report_date TEXT NOT NULL,
      retail_proxy_pct REAL, medium_holder_pct REAL, large_holder_pct REAL, super_holder_pct REAL,
      shareholder_count INTEGER, source TEXT NOT NULL DEFAULT 'manual_or_tdcc', updated_at TEXT NOT NULL,
      PRIMARY KEY(symbol, report_date)
    )` });
    await transaction.execute({ sql: `CREATE TABLE IF NOT EXISTS institutional_holding_daily (
      symbol TEXT NOT NULL, trade_date TEXT NOT NULL,
      foreign_holding_pct REAL, foreign_net_shares REAL, trust_net_shares REAL, dealer_net_shares REAL,
      source TEXT NOT NULL DEFAULT 'official', updated_at TEXT NOT NULL,
      PRIMARY KEY(symbol, trade_date)
    )` });
    await transaction.execute({ sql: `CREATE TABLE IF NOT EXISTS ownership_structure_latest (
      symbol TEXT PRIMARY KEY, data_date TEXT,
      foreign_holding_pct REAL, foreign_holding_change REAL,
      trust_5 REAL, trust_10 REAL, trust_20 REAL,
      large_holder_pct REAL, large_holder_change REAL,
      retail_proxy_pct REAL, retail_proxy_change REAL,
      shareholder_count INTEGER, shareholder_count_change REAL,
      ownership_score REAL NOT NULL DEFAULT 0, capital_stage TEXT NOT NULL DEFAULT '資料不足',
      tags_json TEXT NOT NULL DEFAULT '[]', reasons_json TEXT NOT NULL DEFAULT '[]', calculated_at TEXT NOT NULL
    )` });
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_ownership_score ON ownership_structure_latest(ownership_score DESC)" });
  },
};
