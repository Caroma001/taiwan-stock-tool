import { db } from "@/lib/portfolio/turso";

const MAX_WATCH_POOL = 20;

/**
 * M8.10.6
 * Legacy Bruce-selection auto-watch is intentionally disabled.
 * Strategy performance is now measured with a fixed Stealth Radar Top20 test pool,
 * while manually selected watches remain independent.
 */
export async function syncBruceSelectionWatchPool() {
  const client = db();
  const active = await client.execute({
    sql: `SELECT COUNT(*) AS count FROM hot_stock_candidates
          WHERE is_active=1 AND COALESCE(position_type,'watch')='watch'`,
  });
  const activeCount = Number(active.rows[0]?.count ?? 0);
  return {
    ok: true,
    disabled: true,
    mode: "stealth-radar-top20-test-pool",
    message: "M8.10.6 已停用舊版自動觀察池；正式短週期績效測試改用 Swing10；舊 Top20 固定 Cohort 僅保留作歷史對照。",
    added: [],
    skipped: [],
    activeCount,
    max: MAX_WATCH_POOL,
  };
}
