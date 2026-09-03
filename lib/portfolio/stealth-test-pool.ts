import { randomUUID } from "node:crypto";
import { createTursoDatabase } from "@/lib/database/createTursoDatabase";
import type { DatabaseAdapter, DatabaseRow } from "@/lib/database";
import { MigrationRunner } from "@/migrations/database/MigrationRunner";
import { tursoMigrations } from "@/migrations/turso";
import { USER_NAME } from "@/lib/portfolio/turso";
import { calculateBuyFee } from "@/lib/portfolio/trade-calculator";
import { getInstitutionalStealthCandidates } from "@/lib/institutional-stealth/service";
import { readSmartSelection } from "@/lib/smart-selection/service";

export const STEALTH_TEST_POOL_SIZE = 20;
export const STEALTH_TEST_NOTIONAL_PER_SYMBOL = 100_000;
export const STEALTH_TEST_STRATEGY_TAG = "stealth-radar-top20-m8106";

const n = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

async function database(): Promise<DatabaseAdapter> {
  const db = createTursoDatabase();
  await new MigrationRunner(db, tursoMigrations).migrate();
  return db;
}

export type StealthTestPoolCandidate = {
  rank: number;
  symbol: string;
  stockName: string;
  tradeDate: string;
  entryPrice: number;
  shares: number;
  quantityLots: number;
  grossCost: number;
  buyFee: number;
  potentialScore: number;
  breakoutScore: number | null;
  stealthScore: number | null;
  stage: string;
};

async function resolveLatestPrices(db: DatabaseAdapter, symbols: string[]) {
  if (!symbols.length) return new Map<string, { tradeDate: string; close: number }>();
  const placeholders = symbols.map(() => "?").join(",");
  const result = await db.execute<DatabaseRow>({
    sql: `SELECT s.symbol,i.trade_date,i.close
      FROM stocks s
      LEFT JOIN indicator_latest i ON i.symbol=s.symbol
      WHERE s.symbol IN (${placeholders})`,
    args: symbols,
  });
  const map = new Map<string, { tradeDate: string; close: number }>();
  for (const row of result.rows) {
    const symbol = String(row.symbol ?? "");
    const tradeDate = String(row.trade_date ?? "").slice(0, 10);
    const close = n(row.close);
    if (symbol && tradeDate && close > 0) map.set(symbol, { tradeDate, close });
  }
  return map;
}

/**
 * Read the exact same candidate universe / ranking used by the Unified Stealth Radar.
 * We deliberately do not retrain Winner25 here. The latest validated live scores are used.
 */
export async function getStealthRadarTop20ForTest(): Promise<StealthTestPoolCandidate[]> {
  const db = await database();
  const universe = await getInstitutionalStealthCandidates(40);
  const selection = await readSmartSelection(40, universe);
  const ranked = [...(selection.rows as any[])].sort(
    (a, b) => n(b.potentialScore) - n(a.potentialScore)
      || n(b.stealthScore) - n(a.stealthScore)
      || n(b.breakoutScore) - n(a.breakoutScore),
  );
  const priceMap = await resolveLatestPrices(db, ranked.map((row) => String(row.symbol)));
  const candidates: StealthTestPoolCandidate[] = [];

  for (const row of ranked) {
    if (candidates.length >= STEALTH_TEST_POOL_SIZE) break;
    const symbol = String(row.symbol ?? "");
    const price = priceMap.get(symbol);
    if (!symbol || !price) continue;

    // Equal-notional simulation: each stock receives at most NT$100,000.
    // Taiwan odd-lot simulation is allowed, so this prevents high-priced stocks
    // from dominating the strategy return merely because one board lot is expensive.
    const shares = Math.max(1, Math.floor(STEALTH_TEST_NOTIONAL_PER_SYMBOL / price.close));
    const quantityLots = shares / 1000;
    const grossCost = Math.round(shares * price.close);
    const buyFee = calculateBuyFee(grossCost);

    candidates.push({
      rank: candidates.length + 1,
      symbol,
      stockName: String(row.stockName ?? ""),
      tradeDate: price.tradeDate,
      entryPrice: price.close,
      shares,
      quantityLots,
      grossCost,
      buyFee,
      potentialScore: n(row.potentialScore ?? row.predictionScore ?? row.compositeScore),
      breakoutScore: row.breakoutScore == null ? null : n(row.breakoutScore),
      stealthScore: row.stealthScore == null ? null : n(row.stealthScore),
      stage: String(row.stealthStage ?? "資料不足"),
    });
  }

  if (candidates.length < STEALTH_TEST_POOL_SIZE) {
    throw new Error(`歷史 Top20 候選目前只有 ${candidates.length} 檔具備有效收盤價，無法建立完整 Top 20 測試池。請先執行「每日一鍵更新」完成市場、籌碼、Winner25 與法人潛伏資料。`);
  }
  return candidates;
}


export async function getStealthRadarCohortStatus() {
  const db = await database();
  const result = await db.execute<DatabaseRow>({
    sql: `SELECT strategy_batch_id,
      MIN(buy_date) AS start_date,
      COUNT(DISTINCT symbol) AS symbol_count,
      MIN(CASE WHEN (SELECT 1 FROM daily_prices dp WHERE dp.symbol=pl.symbol AND dp.trade_date>=pl.buy_date ORDER BY dp.trade_date LIMIT 1 OFFSET 19) IS NOT NULL
        THEN 20 ELSE (SELECT COUNT(*) FROM daily_prices dp WHERE dp.symbol=pl.symbol AND dp.trade_date>=pl.buy_date) END) AS min_observation_days,
      MAX(CASE WHEN (SELECT 1 FROM daily_prices dp WHERE dp.symbol=pl.symbol AND dp.trade_date>=pl.buy_date ORDER BY dp.trade_date LIMIT 1 OFFSET 19) IS NOT NULL
        THEN 20 ELSE (SELECT COUNT(*) FROM daily_prices dp WHERE dp.symbol=pl.symbol AND dp.trade_date>=pl.buy_date) END) AS max_observation_days,
      MIN(selection_rank) AS min_rank,
      MAX(selection_rank) AS max_rank
      FROM portfolio_lots pl
      WHERE user_name=? AND holding_type='test' AND status='open' AND remaining_lots>0
        AND strategy_tag LIKE 'stealth-radar-top20%'
      GROUP BY strategy_batch_id
      ORDER BY MAX(created_at) DESC LIMIT 1`,
    args: [USER_NAME],
  });
  const row = result.rows[0];
  if (!row) return {
    active: false,
    batchId: null,
    startDate: null,
    count: 0,
    minObservationDays: 0,
    maxObservationDays: 0,
    matured: false,
    canCreateNext: true,
    message: "目前沒有進行中的歷史 Top20 Cohort。",
  };
  const minDays = n(row.min_observation_days);
  const maxDays = n(row.max_observation_days);
  const count = n(row.symbol_count);
  const matured = count > 0 && minDays >= 20;
  return {
    active: true,
    batchId: String(row.strategy_batch_id ?? ""),
    startDate: String(row.start_date ?? "").slice(0, 10) || null,
    count,
    minObservationDays: minDays,
    maxObservationDays: maxDays,
    matured,
    canCreateNext: matured,
    message: matured
      ? "本期 Top20 已全部滿 20 個交易日，可建立下一期 Cohort。"
      : `本期 Top20 固定追蹤中；最少已觀察 ${minDays}/20 個交易日，不會因每日排行改變而換股。`,
  };
}

export async function rebuildStealthRadarTop20TestPool(options: { force?: boolean } = {}) {
  const db = await database();
  const cohort = await getStealthRadarCohortStatus();
  if (cohort.active && !cohort.canCreateNext && !options.force) {
    throw new Error(`${cohort.message} 為避免績效失真，M8.10.6 不允許提前重建測試池。`);
  }
  const candidates = await getStealthRadarTop20ForTest();
  const now = new Date().toISOString();
  const batchDate = candidates.map((item) => item.tradeDate).sort().at(-1) ?? now.slice(0, 10);
  const batchId = `stealth-top20-${batchDate}-${Date.now()}`;

  const previousTests = await db.execute<DatabaseRow>({
    sql: `SELECT COUNT(*) AS count FROM portfolio_lots
          WHERE user_name=? AND holding_type='test' AND status='open' AND remaining_lots>0`,
    args: [USER_NAME],
  });
  const oldTestCount = n(previousTests.rows[0]?.count);

  const oldAutoWatch = await db.execute<DatabaseRow>({
    sql: `SELECT COUNT(*) AS count FROM hot_stock_candidates
          WHERE is_active=1 AND COALESCE(position_type,'watch')='watch'
            AND (source LIKE 'bruce-selection-auto%' OR source LIKE 'stealth-radar-auto%' OR source LIKE 'stealth-top20%')`,
  });
  const archivedAutoWatchCount = n(oldAutoWatch.rows[0]?.count);

  await db.transaction(async (tx) => {
    // Clear the old *test strategy* without touching actual holdings or trade history.
    // Closing instead of deleting keeps FK-linked AI/trade records intact for audit.
    await tx.execute({
      sql: `UPDATE portfolio_lots
            SET remaining_lots=0,status='closed',updated_at=?,
                note=CASE WHEN note IS NULL OR note='' THEN ? ELSE note || '｜' || ? END
            WHERE user_name=? AND holding_type='test' AND status='open'`,
      args: [now, "M8.10.6.2：上一期測試結束，建立新的固定 Top20 Cohort。", "M8.10.6.2：上一期測試結束，建立新的固定 Top20 Cohort。", USER_NAME],
    });

    // Archive only system-generated old watch rows. Manually selected watches stay intact.
    await tx.execute({
      sql: `UPDATE hot_stock_candidates
            SET is_active=0,status='replaced',updated_at=?
            WHERE is_active=1 AND COALESCE(position_type,'watch')='watch'
              AND (source LIKE 'bruce-selection-auto%' OR source LIKE 'stealth-radar-auto%' OR source LIKE 'stealth-top20%')`,
      args: [now],
    });

    for (const item of candidates) {
      const id = randomUUID();
      const note = `歷史固定 Cohort Top20 等權重測試 #${String(item.rank).padStart(2, "0")}｜每檔目標資金 NT$${STEALTH_TEST_NOTIONAL_PER_SYMBOL.toLocaleString("en-US")}｜潛力 ${item.potentialScore.toFixed(1)}｜Winner25 ${item.breakoutScore == null ? "—" : item.breakoutScore.toFixed(1)}｜法人潛伏 ${item.stealthScore == null ? "—" : item.stealthScore.toFixed(1)}｜階段 ${item.stage}`;
      await tx.execute({
        sql: `INSERT INTO portfolio_lots(
          id,user_name,symbol,buy_date,buy_price,quantity_lots,remaining_lots,target_sell_price,
          fees,tax,note,holding_type,status,created_at,updated_at,
          strategy_tag,strategy_batch_id,selection_rank,entry_potential_score,entry_breakout_score,entry_stealth_score,entry_stage
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [
          id, USER_NAME, item.symbol, item.tradeDate, item.entryPrice, item.quantityLots, item.quantityLots, null,
          item.buyFee, 0, note, "test", "open", now, now,
          STEALTH_TEST_STRATEGY_TAG, batchId, item.rank, item.potentialScore, item.breakoutScore, item.stealthScore, item.stage,
        ],
      });
    }
  }, { mode: "write" });

  const totalGross = candidates.reduce((sum, item) => sum + item.grossCost, 0);
  const totalBuyFees = candidates.reduce((sum, item) => sum + item.buyFee, 0);
  return {
    ok: true,
    strategy: STEALTH_TEST_STRATEGY_TAG,
    batchId,
    batchDate,
    removedOldTests: oldTestCount,
    archivedOldAutoWatches: archivedAutoWatchCount,
    inserted: candidates.length,
    notionalPerSymbol: STEALTH_TEST_NOTIONAL_PER_SYMBOL,
    totalGross,
    totalBuyFees,
    totalInitialCost: totalGross + totalBuyFees,
    candidates,
    previousCohort: cohort,
    cohortPolicy: { minimumTradingDays: 20, dailyRebuild: false },
    preserved: {
      actualHoldings: true,
      tradeHistory: true,
      manualWatch: true,
    },
  };
}
