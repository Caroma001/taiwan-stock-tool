import type { DatabaseMigration } from "@/migrations/database/types";

export const createMarketPipelineMigration: DatabaseMigration = {
  version: 3,
  name: "create_market_pipeline",
  async up(transaction) {
    const statements = [
    `CREATE TABLE IF NOT EXISTS daily_prices (
      symbol TEXT NOT NULL,
      trade_date TEXT NOT NULL,
      open REAL,
      high REAL,
      low REAL,
      close REAL,
      volume INTEGER,
      turnover REAL,
      source TEXT NOT NULL DEFAULT 'finmind',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (symbol, trade_date),
      FOREIGN KEY (symbol) REFERENCES stocks(symbol)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_daily_prices_trade_date ON daily_prices(trade_date)`,
    `CREATE TABLE IF NOT EXISTS market_pipeline_runs (
      id TEXT PRIMARY KEY,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      stage TEXT NOT NULL,
      total_symbols INTEGER NOT NULL DEFAULT 0,
      processed_symbols INTEGER NOT NULL DEFAULT 0,
      success_symbols INTEGER NOT NULL DEFAULT 0,
      failed_symbols INTEGER NOT NULL DEFAULT 0,
      current_symbol TEXT,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      error TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS market_pipeline_tasks (
      run_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'waiting',
      stage TEXT NOT NULL DEFAULT 'prices',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (run_id, symbol)
    )`,
    `CREATE TABLE IF NOT EXISTS indicator_latest (
      symbol TEXT PRIMARY KEY,
      trade_date TEXT NOT NULL,
      close REAL,
      ma5 REAL, ma10 REAL, ma20 REAL, ma60 REAL, ma120 REAL, ma240 REAL,
      volume_ma5 REAL, volume_ma20 REAL,
      rsi14 REAL, k REAL, d REAL,
      macd REAL, macd_signal REAL, macd_histogram REAL,
      bollinger_upper REAL, bollinger_middle REAL, bollinger_lower REAL,
      atr14 REAL,
      calculated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS ai_analysis_latest (
      symbol TEXT PRIMARY KEY,
      trade_date TEXT NOT NULL,
      trend_score REAL NOT NULL,
      momentum_score REAL NOT NULL,
      volume_score REAL NOT NULL,
      risk_score REAL NOT NULL,
      total_score REAL NOT NULL,
      confidence REAL NOT NULL,
      reasons_json TEXT NOT NULL,
      calculated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS decision_latest (
      symbol TEXT PRIMARY KEY,
      trade_date TEXT NOT NULL,
      recommendation TEXT NOT NULL,
      target_1 REAL,
      target_2 REAL,
      stop_loss REAL,
      expected_return REAL,
      risk_reward REAL,
      holding_days INTEGER NOT NULL,
      confidence REAL NOT NULL,
      reason TEXT NOT NULL,
      calculated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS top30_snapshots (
      snapshot_date TEXT NOT NULL,
      rank INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      total_score REAL NOT NULL,
      recommendation TEXT NOT NULL,
      close REAL,
      target_1 REAL,
      target_2 REAL,
      stop_loss REAL,
      expected_return REAL,
      risk_reward REAL,
      confidence REAL NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (snapshot_date, rank)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_top30_symbol ON top30_snapshots(symbol)`
  ];
    for (const sql of statements) await transaction.execute({ sql });
  },
};
