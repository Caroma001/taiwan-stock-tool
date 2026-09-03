import type { DatabaseMigration } from "@/migrations/database/types";

/**
 * M8.10.27 — Swing10 Trade Execution & Exit Alerts
 *
 * Keeps the existing portfolio tables intact. Swing10-specific entry snapshots,
 * exit rules and daily alert results live in additive tables only.
 */
export const swing10TradeExecutionMigration: DatabaseMigration = {
  version: 35,
  name: "swing10_trade_execution_exit_alerts_m81027",
  async up(transaction) {
    await transaction.execute({ sql: `CREATE TABLE IF NOT EXISTS swing10_trade_positions (
      lot_id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      holding_type TEXT NOT NULL CHECK (holding_type IN ('real','test')),
      entry_trade_date TEXT NOT NULL,
      entry_grade TEXT NOT NULL,
      entry_rank INTEGER,
      entry_swing10_score REAL,
      entry_decision_score REAL,
      entry_potential_score REAL,
      entry_stealth_score REAL,
      entry_trigger_score REAL,
      entry_market_risk_level TEXT,
      entry_market_risk_score REAL,
      entry_margin_washout_score REAL,
      entry_foreign_persistence_score REAL,
      entry_daytrade_ratio_pct REAL,
      entry_daytrade_noise_penalty REAL,
      entry_risk_confidence_pct REAL,
      take_profit_pct REAL NOT NULL DEFAULT 8,
      stop_loss_pct REAL NOT NULL DEFAULT -4.5,
      max_holding_days INTEGER NOT NULL DEFAULT 10,
      no_momentum_check_day INTEGER NOT NULL DEFAULT 7,
      no_momentum_min_peak_pct REAL NOT NULL DEFAULT 3,
      profit_protect_trigger_pct REAL NOT NULL DEFAULT 8,
      profit_protect_giveback_pct REAL NOT NULL DEFAULT 4,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (lot_id) REFERENCES portfolio_lots(id) ON DELETE CASCADE,
      FOREIGN KEY (symbol) REFERENCES stocks(symbol)
    )` });
    await transaction.execute({
      sql: "CREATE INDEX IF NOT EXISTS idx_swing10_trade_positions_symbol ON swing10_trade_positions(symbol,holding_type,entry_trade_date DESC)",
    });

    await transaction.execute({ sql: `CREATE TABLE IF NOT EXISTS swing10_exit_alert_daily (
      lot_id TEXT NOT NULL,
      trade_date TEXT NOT NULL,
      symbol TEXT NOT NULL,
      holding_type TEXT NOT NULL,
      holding_days INTEGER NOT NULL DEFAULT 0,
      current_price REAL,
      return_pct REAL,
      max_return_pct REAL,
      drawdown_from_peak_pct REAL,
      current_grade TEXT,
      current_rank INTEGER,
      current_swing10_score REAL,
      current_decision_score REAL,
      decision_change_from_entry REAL,
      current_stealth_score REAL,
      current_foreign_persistence_score REAL,
      current_market_risk_level TEXT,
      current_market_risk_score REAL,
      current_daytrade_noise_penalty REAL,
      action TEXT NOT NULL DEFAULT 'hold' CHECK (action IN ('hold','watch','sell_check')),
      severity TEXT NOT NULL DEFAULT 'green' CHECK (severity IN ('green','yellow','red')),
      reasons_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (lot_id, trade_date),
      FOREIGN KEY (lot_id) REFERENCES portfolio_lots(id) ON DELETE CASCADE,
      FOREIGN KEY (symbol) REFERENCES stocks(symbol)
    )` });
    await transaction.execute({
      sql: "CREATE INDEX IF NOT EXISTS idx_swing10_exit_alert_daily_date ON swing10_exit_alert_daily(trade_date DESC,action,holding_type)",
    });
  },
};
