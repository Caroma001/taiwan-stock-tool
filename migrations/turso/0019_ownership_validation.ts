import type { DatabaseMigration } from "@/migrations/database/types";
import type { DatabaseTransaction } from "@/lib/database";

async function addColumn(transaction: DatabaseTransaction, sql: string) {
  try { await transaction.execute({ sql }); } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/duplicate column|already exists/i.test(message)) throw error;
  }
}

export const createOwnershipValidationMigration: DatabaseMigration = {
  version: 19,
  name: "ownership_validation_m897",
  async up(transaction) {
    await addColumn(transaction, "ALTER TABLE ownership_structure_latest ADD COLUMN distribution_valid INTEGER NOT NULL DEFAULT 0");
    await addColumn(transaction, "ALTER TABLE ownership_structure_latest ADD COLUMN data_completeness_pct REAL NOT NULL DEFAULT 0");
    await addColumn(transaction, "ALTER TABLE ownership_structure_latest ADD COLUMN validation_message TEXT");

    // M8.9.6 曾可能把 TDCC 級距代碼誤判，造成 0% / 199% 類型結果。
    // 升版時先將不可能值標成無效；重新同步後由 M8.9.7 正確重建。
    await transaction.execute({ sql: `UPDATE ownership_structure_latest
      SET large_holder_pct=NULL,
          retail_proxy_pct=NULL,
          large_holder_change=NULL,
          retail_proxy_change=NULL,
          distribution_valid=0,
          data_completeness_pct=0,
          validation_message='M8.9.7: 舊股權分散資料需重新同步'
      WHERE large_holder_pct IS NULL
         OR retail_proxy_pct IS NULL
         OR large_holder_pct < 0 OR large_holder_pct > 100
         OR retail_proxy_pct < 0 OR retail_proxy_pct > 100
         OR ABS((large_holder_pct + retail_proxy_pct) - 100) > 0.2` });
  },
};
