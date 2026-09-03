import type { DatabaseMigration } from "@/migrations/database/types";

export const createDataCenterMigration: DatabaseMigration = {
  version: 12,
  name: "create_data_center_queue_and_ai_snapshots",
  async up(transaction) {
    await transaction.execute({
      sql: `CREATE TABLE IF NOT EXISTS update_queue (
        id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        purpose TEXT NOT NULL DEFAULT 'daily',
        priority INTEGER NOT NULL DEFAULT 100,
        status TEXT NOT NULL DEFAULT 'waiting',
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 5,
        next_attempt_at TEXT,
        locked_at TEXT,
        locked_by TEXT,
        last_error_code TEXT,
        last_error_message TEXT,
        requested_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        updated_at TEXT NOT NULL,
        UNIQUE(symbol,purpose),
        FOREIGN KEY(symbol) REFERENCES stocks(symbol)
      )`,
    });
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_update_queue_ready ON update_queue(status,next_attempt_at,priority,requested_at)" });
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_update_queue_symbol ON update_queue(symbol,status)" });

    await transaction.execute({
      sql: `CREATE TABLE IF NOT EXISTS ai_snapshots (
        id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        trade_date TEXT NOT NULL,
        model_version TEXT NOT NULL,
        close REAL,
        raw_score REAL,
        market_adjustment REAL,
        final_score REAL,
        trend_score REAL,
        momentum_score REAL,
        volume_score REAL,
        risk_score REAL,
        confidence REAL,
        recommendation TEXT,
        target_1 REAL,
        target_2 REAL,
        stop_loss REAL,
        expected_return REAL,
        risk_reward REAL,
        reasons_json TEXT,
        source_event TEXT NOT NULL DEFAULT 'queue',
        created_at TEXT NOT NULL,
        UNIQUE(symbol,trade_date,model_version,source_event),
        FOREIGN KEY(symbol) REFERENCES stocks(symbol)
      )`,
    });
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_ai_snapshots_symbol_date ON ai_snapshots(symbol,trade_date DESC)" });
  },
};
