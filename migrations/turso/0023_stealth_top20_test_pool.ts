import type { DatabaseMigration } from "@/migrations/database/types";

/**
 * M8.10.6
 * Persist the strategy metadata used by the Stealth Radar Top20 performance pool.
 * Existing real holdings and trade-history tables are untouched.
 */
export const createStealthTop20TestPoolMigration: DatabaseMigration = {
  version: 23,
  name: "stealth_top20_test_pool_m8106",
  async up(transaction) {
    await transaction.execute({ sql: "ALTER TABLE portfolio_lots ADD COLUMN strategy_tag TEXT" });
    await transaction.execute({ sql: "ALTER TABLE portfolio_lots ADD COLUMN strategy_batch_id TEXT" });
    await transaction.execute({ sql: "ALTER TABLE portfolio_lots ADD COLUMN selection_rank INTEGER" });
    await transaction.execute({ sql: "ALTER TABLE portfolio_lots ADD COLUMN entry_potential_score REAL" });
    await transaction.execute({ sql: "ALTER TABLE portfolio_lots ADD COLUMN entry_breakout_score REAL" });
    await transaction.execute({ sql: "ALTER TABLE portfolio_lots ADD COLUMN entry_stealth_score REAL" });
    await transaction.execute({ sql: "ALTER TABLE portfolio_lots ADD COLUMN entry_stage TEXT" });
    await transaction.execute({ sql: "CREATE INDEX IF NOT EXISTS idx_portfolio_strategy_batch ON portfolio_lots(user_name,holding_type,status,strategy_batch_id,selection_rank)" });
  },
};
