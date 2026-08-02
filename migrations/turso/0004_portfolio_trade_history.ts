import type { DatabaseMigration } from "@/migrations/database/types";

export const createPortfolioTradeHistoryMigration: DatabaseMigration = {
  version: 4,
  name: "create_portfolio_trade_history",
  async up(transaction) {
    const statements = [
      `CREATE TABLE IF NOT EXISTS portfolio_lots (
        id TEXT PRIMARY KEY,
        user_name TEXT NOT NULL DEFAULT 'Bruce',
        symbol TEXT NOT NULL,
        buy_date TEXT NOT NULL,
        buy_price REAL NOT NULL CHECK (buy_price > 0),
        quantity_lots REAL NOT NULL CHECK (quantity_lots > 0),
        remaining_lots REAL NOT NULL CHECK (remaining_lots >= 0),
        target_sell_price REAL,
        fees REAL NOT NULL DEFAULT 0,
        tax REAL NOT NULL DEFAULT 0,
        note TEXT,
        holding_type TEXT NOT NULL DEFAULT 'real' CHECK (holding_type IN ('real','test')),
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (symbol) REFERENCES stocks(symbol)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_portfolio_lots_user_status ON portfolio_lots(user_name,status,holding_type)`,
      `CREATE INDEX IF NOT EXISTS idx_portfolio_lots_symbol ON portfolio_lots(symbol)`,
      `CREATE TABLE IF NOT EXISTS trade_history (
        id TEXT PRIMARY KEY,
        user_name TEXT NOT NULL DEFAULT 'Bruce',
        lot_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        stock_name TEXT,
        buy_date TEXT NOT NULL,
        sell_date TEXT NOT NULL,
        buy_price REAL NOT NULL,
        sell_price REAL NOT NULL,
        quantity_lots REAL NOT NULL,
        gross_cost REAL NOT NULL,
        gross_proceeds REAL NOT NULL,
        buy_fees REAL NOT NULL DEFAULT 0,
        sell_fees REAL NOT NULL DEFAULT 0,
        transaction_tax REAL NOT NULL DEFAULT 0,
        realized_profit REAL NOT NULL,
        realized_return_pct REAL NOT NULL,
        holding_type TEXT NOT NULL CHECK (holding_type IN ('real','test')),
        note TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (lot_id) REFERENCES portfolio_lots(id),
        FOREIGN KEY (symbol) REFERENCES stocks(symbol)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_trade_history_user_date ON trade_history(user_name,sell_date DESC)`,
      `CREATE TABLE IF NOT EXISTS watchlist (
        id TEXT PRIMARY KEY,
        user_name TEXT NOT NULL DEFAULT 'Bruce',
        symbol TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(user_name,symbol),
        FOREIGN KEY (symbol) REFERENCES stocks(symbol)
      )`,
      `CREATE TABLE IF NOT EXISTS ai_decisions (
        id TEXT PRIMARY KEY,
        user_name TEXT NOT NULL DEFAULT 'Bruce',
        lot_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        decision_date TEXT NOT NULL,
        recommendation TEXT NOT NULL,
        target_1 REAL,
        target_2 REAL,
        stop_loss REAL,
        confidence REAL,
        total_score REAL,
        reason TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(lot_id,decision_date),
        FOREIGN KEY (lot_id) REFERENCES portfolio_lots(id),
        FOREIGN KEY (symbol) REFERENCES stocks(symbol)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_ai_decisions_lot_date ON ai_decisions(lot_id,decision_date DESC)`
    ];
    for (const sql of statements) await transaction.execute({ sql });
  },
};
