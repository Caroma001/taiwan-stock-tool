import type { DatabaseMigration } from "@/migrations/database/types";

/**
 * M8.12.2 from M8.11.10
 * 不建立 M8.11.11 的額外 Daily Job Lock 狀態表。
 */
export const m8122QualityBruceScoreMigration:DatabaseMigration={
  version: 40,
  name:"m8121_data_quality_bruce_swing_score",
  async up(transaction){
    await transaction.execute({sql:`CREATE TABLE IF NOT EXISTS daily_quality_snapshots(
      trade_date TEXT PRIMARY KEY,
      score INTEGER NOT NULL,
      level TEXT NOT NULL,
      publish_mode TEXT NOT NULL,
      report_exists INTEGER NOT NULL DEFAULT 0,
      quality_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`});
    await transaction.execute({sql:`CREATE TABLE IF NOT EXISTS bruce_swing_score_daily(
      trade_date TEXT NOT NULL,
      symbol TEXT NOT NULL,
      stock_name TEXT,
      score REAL NOT NULL,
      grade TEXT NOT NULL,
      action TEXT NOT NULL,
      confidence REAL NOT NULL,
      chip_score REAL NOT NULL,
      momentum_score REAL NOT NULL,
      relative_strength_score REAL NOT NULL,
      foreign_stealth_score REAL NOT NULL,
      fundamental_score REAL NOT NULL,
      market_score REAL NOT NULL,
      washout_score REAL NOT NULL,
      reasons_json TEXT NOT NULL DEFAULT '[]',
      warnings_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(trade_date,symbol)
    )`});
    await transaction.execute({sql:"CREATE INDEX IF NOT EXISTS idx_daily_quality_mode ON daily_quality_snapshots(publish_mode,trade_date DESC)"});
    await transaction.execute({sql:"CREATE INDEX IF NOT EXISTS idx_bruce_swing_rank ON bruce_swing_score_daily(trade_date DESC,score DESC)"});
  },
};
