import type { DatabaseMigration } from "@/migrations/database/types";
import type { DatabaseTransaction } from "@/lib/database";

async function addColumn(transaction: DatabaseTransaction, sql: string) {
  try {
    await transaction.execute({ sql });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/duplicate column|already exists/i.test(message)) throw error;
  }
}

export const createWinner25AnalysisMigration: DatabaseMigration = {
  version: 20,
  name: "winner25_historical_breakout_analysis_m8103",
  async up(transaction) {
    await transaction.execute({ sql: `CREATE TABLE IF NOT EXISTS winner25_runs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      history_start TEXT NOT NULL,
      history_end TEXT NOT NULL,
      last_symbol TEXT,
      total_symbols INTEGER NOT NULL DEFAULT 0,
      processed_symbols INTEGER NOT NULL DEFAULT 0,
      sample_count INTEGER NOT NULL DEFAULT 0,
      winner_count INTEGER NOT NULL DEFAULT 0,
      train_sample_count INTEGER NOT NULL DEFAULT 0,
      train_winner_count INTEGER NOT NULL DEFAULT 0,
      test_sample_count INTEGER NOT NULL DEFAULT 0,
      test_winner_count INTEGER NOT NULL DEFAULT 0,
      baseline_train_rate REAL,
      baseline_test_rate REAL,
      best_test_lift REAL,
      model_active INTEGER NOT NULL DEFAULT 0,
      settings_json TEXT NOT NULL DEFAULT '{}',
      summary_json TEXT NOT NULL DEFAULT '{}',
      last_error TEXT
    )` });

    await transaction.execute({ sql: `CREATE TABLE IF NOT EXISTS winner25_samples (
      run_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      signal_date TEXT NOT NULL,
      base_close REAL NOT NULL,
      future_max_close REAL NOT NULL,
      future_max_date TEXT NOT NULL,
      future_return_pct REAL NOT NULL,
      days_to_peak INTEGER NOT NULL,
      is_winner INTEGER NOT NULL,
      sample_kind TEXT NOT NULL,
      features_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(run_id, symbol, signal_date),
      FOREIGN KEY(run_id) REFERENCES winner25_runs(id) ON DELETE CASCADE
    )` });
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_w25_samples_run_winner ON winner25_samples(run_id,is_winner,signal_date)" });
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_w25_samples_symbol_date ON winner25_samples(symbol,signal_date)" });

    await transaction.execute({ sql: `CREATE TABLE IF NOT EXISTS winner25_rules (
      run_id TEXT NOT NULL,
      rank INTEGER NOT NULL,
      feature_key TEXT NOT NULL,
      direction TEXT NOT NULL,
      threshold REAL NOT NULL,
      train_support INTEGER NOT NULL,
      train_winners INTEGER NOT NULL,
      train_win_rate REAL NOT NULL,
      train_lift REAL NOT NULL,
      test_support INTEGER NOT NULL,
      test_winners INTEGER NOT NULL,
      test_win_rate REAL NOT NULL,
      test_lift REAL NOT NULL,
      score_weight REAL NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(run_id,rank),
      FOREIGN KEY(run_id) REFERENCES winner25_runs(id) ON DELETE CASCADE
    )` });
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_w25_rules_run_lift ON winner25_rules(run_id,test_lift DESC)" });

    await addColumn(transaction, "ALTER TABLE ai_analysis_latest ADD COLUMN breakout_score REAL");
    await addColumn(transaction, "ALTER TABLE ai_analysis_latest ADD COLUMN breakout_model_run_id TEXT");
    await addColumn(transaction, "ALTER TABLE ai_analysis_latest ADD COLUMN breakout_reasons_json TEXT NOT NULL DEFAULT '[]'");
    await addColumn(transaction, "ALTER TABLE ai_analysis_latest ADD COLUMN breakout_model_active INTEGER NOT NULL DEFAULT 0");
  },
};
