import { randomUUID } from "node:crypto";
import { createTursoDatabase } from "@/lib/database/createTursoDatabase";
import type { DatabaseAdapter, DatabaseRow } from "@/lib/database";
import { MigrationRunner } from "@/migrations/database/MigrationRunner";
import { tursoMigrations } from "@/migrations/turso";
import { fetchForeignTrading, fetchInstitutionalTrading } from "@/providers/FinMindPriceProvider";

export type ForeignAccumulationLabel =
  | "外資強力吸籌"
  | "外資潛伏"
  | "外資偏多"
  | "訊號偏弱"
  | "資料不足";

export type ForeignAccumulation = {
  symbol: string;
  tradeDate: string | null;
  foreign5: number | null;
  foreign10: number | null;
  foreign20: number | null;
  foreign60: number | null;
  buyDays5: number;
  buyDays10: number;
  buyDays20: number;
  buyDays60: number;
  price5Pct: number | null;
  price10Pct: number | null;
  price20Pct: number | null;
  price60Pct: number | null;
  score: number;
  stars: number;
  dataDays: number;
  label: ForeignAccumulationLabel;
  tags: string[];
  reasons: string[];
  components: {
    amount: number;
    consistency: number;
    mutedPrice: number;
    acceleration: number;
    absorption: number;
  };
  calculatedAt?: string | null;
};

type FlowPoint = DatabaseRow & { trade_date: string; net_buy_shares: number };
type PricePoint = DatabaseRow & { trade_date: string; close: number; volume: number };
type RadarRow = DatabaseRow & {
  symbol: string;
  trade_date: string | null;
  data_days: number;
  foreign_5: number | null;
  foreign_10: number | null;
  foreign_20: number | null;
  foreign_60: number | null;
  buy_days_5: number;
  buy_days_10: number;
  buy_days_20: number;
  buy_days_60: number;
  price_5_pct: number | null;
  price_10_pct: number | null;
  price_20_pct: number | null;
  price_60_pct: number | null;
  amount_score: number;
  consistency_score: number;
  muted_price_score: number;
  acceleration_score: number;
  absorption_score: number;
  accumulation_score: number;
  stars: number;
  signal: string;
  reasons_json: string;
  calculated_at: string;
};

const n = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const daysAgo = (days: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return isoDate(date);
};

async function database(options: { migrate?: boolean } = {}) {
  const db = createTursoDatabase();
  if (options.migrate) await new MigrationRunner(db, tursoMigrations).migrate();
  return db;
}

function pctReturn(rows: PricePoint[], days: number): number | null {
  if (rows.length <= days || rows[days].close <= 0) return null;
  return ((rows[0].close / rows[days].close) - 1) * 100;
}

function sumFlows(flows: FlowPoint[], days: number): number | null {
  if (flows.length < Math.min(days, 5)) return null;
  return flows.slice(0, days).reduce((sum, row) => sum + n(row.net_buy_shares), 0);
}

function buyDays(flows: FlowPoint[], days: number): number {
  return flows.slice(0, days).filter((row) => n(row.net_buy_shares) > 0).length;
}

function starsFromScore(score: number): number {
  if (score >= 82) return 5;
  if (score >= 68) return 4;
  if (score >= 52) return 3;
  if (score >= 36) return 2;
  return score > 0 ? 1 : 0;
}

function labelFromScore(score: number, dataDays: number): ForeignAccumulationLabel {
  if (dataDays < 10) return "資料不足";
  if (score >= 82) return "外資強力吸籌";
  if (score >= 65) return "外資潛伏";
  if (score >= 48) return "外資偏多";
  return "訊號偏弱";
}

export function scoreForeignAccumulation(
  symbol: string,
  flowsInput: FlowPoint[],
  pricesInput: PricePoint[],
): ForeignAccumulation {
  const flows = [...flowsInput].sort((a, b) => b.trade_date.localeCompare(a.trade_date)).slice(0, 60);
  const prices = [...pricesInput].sort((a, b) => b.trade_date.localeCompare(a.trade_date)).slice(0, 61);
  const dataDays = Math.min(flows.length, 60);

  const foreign5 = sumFlows(flows, 5);
  const foreign10 = sumFlows(flows, 10);
  const foreign20 = sumFlows(flows, 20);
  const foreign60 = sumFlows(flows, 60);
  const buyDays5 = buyDays(flows, 5);
  const buyDays10 = buyDays(flows, 10);
  const buyDays20 = buyDays(flows, 20);
  const buyDays60 = buyDays(flows, 60);
  const price5Pct = pctReturn(prices, 5);
  const price10Pct = pctReturn(prices, 10);
  const price20Pct = pctReturn(prices, 20);
  const price60Pct = pctReturn(prices, 60);

  const volume20 = prices.slice(0, 20).reduce((sum, row) => sum + Math.max(0, n(row.volume)), 0);
  const net20Ratio = foreign20 == null || volume20 <= 0 ? 0 : foreign20 / volume20;

  let amount = 0;
  if ((foreign20 ?? 0) > 0) {
    if (net20Ratio >= 0.12) amount = 25;
    else if (net20Ratio >= 0.07) amount = 21;
    else if (net20Ratio >= 0.04) amount = 17;
    else if (net20Ratio >= 0.02) amount = 12;
    else amount = 7;
  }

  const consistencyRatio = dataDays > 0 ? buyDays20 / Math.min(20, dataDays) : 0;
  const consistency = consistencyRatio >= 0.75 ? 20 : consistencyRatio >= 0.6 ? 16 : consistencyRatio >= 0.5 ? 12 : consistencyRatio >= 0.4 ? 7 : 0;

  let mutedPrice = 0;
  if (price20Pct != null) {
    if (price20Pct <= 0) mutedPrice = 22;
    else if (price20Pct <= 3) mutedPrice = 21;
    else if (price20Pct <= 6) mutedPrice = 18;
    else if (price20Pct <= 10) mutedPrice = 12;
    else if (price20Pct <= 15) mutedPrice = 6;
  }

  const recent5 = foreign5 ?? 0;
  const prior15 = (foreign20 ?? 0) - recent5;
  const recentDaily = recent5 / 5;
  const priorDaily = prior15 / 15;
  let acceleration = 0;
  if (recentDaily > 0 && recentDaily > Math.max(0, priorDaily) * 1.8) acceleration = 14;
  else if (recentDaily > 0 && recentDaily > Math.max(0, priorDaily) * 1.25) acceleration = 10;
  else if (recentDaily > 0 && recentDaily >= priorDaily) acceleration = 6;

  let absorption = 0;
  if ((foreign20 ?? 0) > 0 && price20Pct != null) {
    if (price20Pct <= 3 && net20Ratio >= 0.04) absorption = 19;
    else if (price20Pct <= 6 && net20Ratio >= 0.025) absorption = 15;
    else if (price20Pct <= 10 && net20Ratio >= 0.015) absorption = 10;
    else if (price20Pct <= 15) absorption = 5;
  }

  let score = clamp(amount + consistency + mutedPrice + acceleration + absorption);
  if (dataDays < 10) score = Math.min(score, 39);
  if ((foreign20 ?? 0) <= 0) score = Math.min(score, 34);
  if (price20Pct != null && price20Pct > 20) score = Math.max(0, score - 18);
  score = Math.round(score);

  const tags: string[] = [];
  const reasons: string[] = [];
  if (dataDays < 10) tags.push("法人資料不足");
  if ((foreign20 ?? 0) > 0) {
    tags.push("外資累計買超");
    reasons.push(`近 20 日外資淨買超 ${((foreign20 ?? 0) / 1000).toLocaleString("zh-TW", { maximumFractionDigits: 3 })} 張`);
  } else reasons.push("近 20 日外資尚未形成累計買超");
  reasons.push(`近 20 日買超 ${buyDays20} 天`);
  if (price20Pct != null) reasons.push(`同期股價 ${price20Pct >= 0 ? "+" : ""}${price20Pct.toFixed(2)}%`);
  if ((foreign20 ?? 0) > 0 && price20Pct != null && price20Pct <= 6) {
    tags.push("股價尚未反映");
    reasons.push("符合外資持續投入、價格尚未明顯反映的核心條件");
  }
  if (acceleration >= 10) tags.push("買盤加速");
  if (consistency >= 16) tags.push("連續性佳");
  if (price20Pct != null && price20Pct > 15) tags.push("短線已漲");

  return {
    symbol,
    tradeDate: flows[0]?.trade_date ?? prices[0]?.trade_date ?? null,
    foreign5,
    foreign10,
    foreign20,
    foreign60,
    buyDays5,
    buyDays10,
    buyDays20,
    buyDays60,
    price5Pct,
    price10Pct,
    price20Pct,
    price60Pct,
    score,
    stars: starsFromScore(score),
    dataDays,
    label: labelFromScore(score, dataDays),
    tags: [...new Set(tags)].slice(0, 5),
    reasons,
    components: { amount, consistency, mutedPrice, acceleration, absorption },
  };
}

async function readRawForSymbol(db: DatabaseAdapter, symbol: string) {
  const [flowResult, priceResult] = await Promise.all([
    db.execute<FlowPoint>({
      sql: "SELECT trade_date,net_buy_shares FROM foreign_investor_daily WHERE symbol=? ORDER BY trade_date DESC LIMIT 60",
      args: [symbol],
    }),
    db.execute<PricePoint>({
      sql: "SELECT trade_date,close,COALESCE(volume,0) AS volume FROM daily_prices WHERE symbol=? AND close IS NOT NULL ORDER BY trade_date DESC LIMIT 61",
      args: [symbol],
    }),
  ]);
  return { flows: [...flowResult.rows], prices: [...priceResult.rows] };
}

function snapshotStatement(result: ForeignAccumulation, now = new Date().toISOString()) {
  return {
    sql: `INSERT INTO foreign_accumulation_latest(
      symbol,trade_date,data_days,foreign_5,foreign_10,foreign_20,foreign_60,
      buy_days_5,buy_days_10,buy_days_20,buy_days_60,
      price_5_pct,price_10_pct,price_20_pct,price_60_pct,
      amount_score,consistency_score,muted_price_score,acceleration_score,absorption_score,
      accumulation_score,stars,signal,reasons_json,calculated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(symbol) DO UPDATE SET
      trade_date=excluded.trade_date,data_days=excluded.data_days,
      foreign_5=excluded.foreign_5,foreign_10=excluded.foreign_10,foreign_20=excluded.foreign_20,foreign_60=excluded.foreign_60,
      buy_days_5=excluded.buy_days_5,buy_days_10=excluded.buy_days_10,buy_days_20=excluded.buy_days_20,buy_days_60=excluded.buy_days_60,
      price_5_pct=excluded.price_5_pct,price_10_pct=excluded.price_10_pct,price_20_pct=excluded.price_20_pct,price_60_pct=excluded.price_60_pct,
      amount_score=excluded.amount_score,consistency_score=excluded.consistency_score,muted_price_score=excluded.muted_price_score,
      acceleration_score=excluded.acceleration_score,absorption_score=excluded.absorption_score,
      accumulation_score=excluded.accumulation_score,stars=excluded.stars,signal=excluded.signal,
      reasons_json=excluded.reasons_json,calculated_at=excluded.calculated_at`,
    args: [
      result.symbol, result.tradeDate, result.dataDays,
      result.foreign5, result.foreign10, result.foreign20, result.foreign60,
      result.buyDays5, result.buyDays10, result.buyDays20, result.buyDays60,
      result.price5Pct, result.price10Pct, result.price20Pct, result.price60Pct,
      result.components.amount, result.components.consistency, result.components.mutedPrice,
      result.components.acceleration, result.components.absorption,
      result.score, result.stars, result.label, JSON.stringify(result.reasons), now,
    ],
  };
}

async function saveSnapshot(db: DatabaseAdapter, result: ForeignAccumulation) {
  await db.execute(snapshotStatement(result));
}

/**
 * M8.10.20 bulk scorer. Instead of 2 historical reads for every one of ~2,143
 * stocks, read bounded history for groups of symbols and score in memory. This
 * keeps roughly the same useful historical rows while collapsing thousands of
 * Turso round trips into a few dozen indexed range reads.
 */
export async function refreshForeignAccumulationBulk(
  db: DatabaseAdapter,
  symbols: string[],
  targetTradeDate: string,
  options: { chunkSize?: number } = {},
) {
  const clean = [...new Set(symbols.map(String).filter((symbol) => /^\d{4,6}$/.test(symbol)))];
  const chunkSize = Math.max(80, Math.min(240, Number(options.chunkSize ?? 180)));
  const fromDate = (() => {
    const date = new Date(`${targetTradeDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 150);
    return isoDate(date);
  })();
  let scored = 0;
  let flowRowsRead = 0;
  let priceRowsRead = 0;

  for (let offset = 0; offset < clean.length; offset += chunkSize) {
    const chunk = clean.slice(offset, offset + chunkSize);
    const marks = chunk.map(() => "?").join(",");
    const [flowsResult, pricesResult] = await Promise.all([
      db.execute<FlowPoint & { symbol: string }>({
        sql: `SELECT symbol,trade_date,net_buy_shares FROM foreign_investor_daily
          WHERE symbol IN (${marks}) AND trade_date>=? AND trade_date<=?
          ORDER BY symbol,trade_date DESC`,
        args: [...chunk, fromDate, targetTradeDate],
      }),
      db.execute<PricePoint & { symbol: string }>({
        sql: `SELECT symbol,trade_date,close,COALESCE(volume,0) AS volume FROM daily_prices
          WHERE symbol IN (${marks}) AND trade_date>=? AND trade_date<=? AND close IS NOT NULL
          ORDER BY symbol,trade_date DESC`,
        args: [...chunk, fromDate, targetTradeDate],
      }),
    ]);
    flowRowsRead += flowsResult.rows.length;
    priceRowsRead += pricesResult.rows.length;

    const flowMap = new Map<string, FlowPoint[]>();
    const priceMap = new Map<string, PricePoint[]>();
    for (const row of flowsResult.rows) {
      const symbol = String(row.symbol);
      const list = flowMap.get(symbol) ?? [];
      if (list.length < 60) list.push(row);
      flowMap.set(symbol, list);
    }
    for (const row of pricesResult.rows) {
      const symbol = String(row.symbol);
      const list = priceMap.get(symbol) ?? [];
      if (list.length < 61) list.push(row);
      priceMap.set(symbol, list);
    }

    const now = new Date().toISOString();
    const statements = chunk.map((symbol) =>
      snapshotStatement(scoreForeignAccumulation(symbol, flowMap.get(symbol) ?? [], priceMap.get(symbol) ?? []), now),
    );
    if (statements.length) await db.executeMany(statements);
    scored += statements.length;
  }

  return { scored, flowRowsRead, priceRowsRead, chunks: Math.ceil(clean.length / chunkSize) };
}

export async function refreshForeignAccumulationForSymbol(
  symbol: string,
  options: {
    fetchDays?: number;
    db?: DatabaseAdapter;
    checkpoint?: { latestDate?: string | null; dataDays?: number | null };
    targetTradeDate?: string;
    skipExternalFetch?: boolean;
  } = {},
): Promise<ForeignAccumulation> {
  const db = options.db ?? (await database({ migrate: true }));
  const endDate = options.targetTradeDate ?? isoDate(new Date());

  // M8.10.9: use the one-row accumulation snapshot as the normal checkpoint.
  // The previous COUNT(*) + MAX() scanned all historical flow rows per symbol.
  let latestDate = options.checkpoint?.latestDate ?? null;
  let existingCount = n(options.checkpoint?.dataDays ?? 0);
  if (!latestDate || existingCount <= 0) {
    const checkpoint = await db.execute<DatabaseRow>({
      sql: "SELECT trade_date AS latest_date,data_days AS count FROM foreign_accumulation_latest WHERE symbol=? LIMIT 1",
      args: [symbol],
    });
    latestDate = checkpoint.rows[0]?.latest_date ? String(checkpoint.rows[0]?.latest_date) : null;
    existingCount = n(checkpoint.rows[0]?.count);
  }

  // A completed M8.10.20 bulk snapshot already persisted both foreign flow and
  // trust/dealer rows. Never re-download the identical FinMind institutional
  // dataset per symbol. If today's score is also present, return the one-row
  // cached radar snapshot without rereading 60+61 history rows.
  if (options.skipExternalFetch && latestDate && latestDate >= endDate) {
    const cached = await db.execute<RadarRow>({
      sql: "SELECT * FROM foreign_accumulation_latest WHERE symbol=? LIMIT 1",
      args: [symbol],
    });
    const row = cached.rows[0];
    if (row?.trade_date && String(row.trade_date) >= endDate) return fromRadarRow(row);
  }

  let startDate = daysAgo(options.fetchDays ?? 120);
  if (latestDate && existingCount >= 60) {
    const date = new Date(`${latestDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 5);
    startDate = isoDate(date);
  }
  const [rows, institutionalRows] = options.skipExternalFetch
    ? [[], []] as [Awaited<ReturnType<typeof fetchForeignTrading>>, Awaited<ReturnType<typeof fetchInstitutionalTrading>>]
    : await Promise.all([
        fetchForeignTrading({ symbol, startDate, endDate }),
        fetchInstitutionalTrading({ symbol, startDate, endDate }),
      ]);
  if (rows.length) {
    const now = new Date().toISOString();
    await db.executeMany(rows.map((row) => ({
      sql: `INSERT INTO foreign_investor_daily(symbol,trade_date,net_buy_shares,buy_shares,sell_shares,source,updated_at)
        VALUES(?,?,?,?,?,?,?) ON CONFLICT(symbol,trade_date) DO UPDATE SET
        net_buy_shares=excluded.net_buy_shares,buy_shares=excluded.buy_shares,
        sell_shares=excluded.sell_shares,source=excluded.source,updated_at=excluded.updated_at`,
      args: [row.symbol, row.trade_date, row.foreign_net, row.foreign_buy, row.foreign_sell, row.source, now],
    })));
  }
  if (institutionalRows.length) {
    const now = new Date().toISOString();
    await db.executeMany(institutionalRows.map((row) => ({
      sql: `INSERT INTO institutional_holding_daily(symbol,trade_date,foreign_holding_pct,foreign_net_shares,trust_net_shares,dealer_net_shares,source,updated_at)
        VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(symbol,trade_date) DO UPDATE SET
        foreign_net_shares=excluded.foreign_net_shares,trust_net_shares=excluded.trust_net_shares,
        dealer_net_shares=excluded.dealer_net_shares,source=excluded.source,updated_at=excluded.updated_at`,
      args: [row.symbol, row.trade_date, null, row.foreign_net, row.trust_net, row.dealer_net, row.source, now],
    })));
  }
  const raw = await readRawForSymbol(db, symbol);
  const result = scoreForeignAccumulation(symbol, raw.flows, raw.prices);
  await saveSnapshot(db, result);
  return result;
}

function parseReasons(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function fromRadarRow(row: RadarRow): ForeignAccumulation {
  return {
    symbol: String(row.symbol),
    tradeDate: row.trade_date ? String(row.trade_date) : null,
    foreign5: row.foreign_5 == null ? null : n(row.foreign_5),
    foreign10: row.foreign_10 == null ? null : n(row.foreign_10),
    foreign20: row.foreign_20 == null ? null : n(row.foreign_20),
    foreign60: row.foreign_60 == null ? null : n(row.foreign_60),
    buyDays5: n(row.buy_days_5), buyDays10: n(row.buy_days_10), buyDays20: n(row.buy_days_20), buyDays60: n(row.buy_days_60),
    price5Pct: row.price_5_pct == null ? null : n(row.price_5_pct),
    price10Pct: row.price_10_pct == null ? null : n(row.price_10_pct),
    price20Pct: row.price_20_pct == null ? null : n(row.price_20_pct),
    price60Pct: row.price_60_pct == null ? null : n(row.price_60_pct),
    score: n(row.accumulation_score), stars: n(row.stars), dataDays: n(row.data_days),
    label: String(row.signal ?? "資料不足") as ForeignAccumulationLabel,
    tags: [], reasons: parseReasons(row.reasons_json),
    components: {
      amount: n(row.amount_score), consistency: n(row.consistency_score),
      mutedPrice: n(row.muted_price_score), acceleration: n(row.acceleration_score), absorption: n(row.absorption_score),
    },
    calculatedAt: String(row.calculated_at ?? ""),
  };
}

export async function readForeignAccumulation(symbols: string[]): Promise<Map<string, ForeignAccumulation>> {
  const clean = [...new Set(symbols.map(String).filter(Boolean))];
  const out = new Map<string, ForeignAccumulation>();
  if (!clean.length) return out;
  const db = await database({ migrate: false });
  const marks = clean.map(() => "?").join(",");
  const snapshots = await db.execute<RadarRow>({
    sql: `SELECT * FROM foreign_accumulation_latest WHERE symbol IN (${marks})`,
    args: clean,
  });
  for (const row of snapshots.rows) out.set(String(row.symbol), fromRadarRow(row));

  const missing = clean.filter((symbol) => !out.has(symbol));
  if (missing.length) {
    // Snapshot repair is rare. Prefer bounded index seeks per symbol over one
    // unbounded IN query that reads the complete historical rows for every
    // missing symbol and then discards all but 60/61 rows in JavaScript.
    for (const symbol of missing) {
      const [flowResult, priceResult] = await Promise.all([
        db.execute<FlowPoint>({
          sql: "SELECT trade_date,net_buy_shares FROM foreign_investor_daily WHERE symbol=? ORDER BY trade_date DESC LIMIT 60",
          args: [symbol],
        }),
        db.execute<PricePoint>({
          sql: "SELECT trade_date,close,COALESCE(volume,0) AS volume FROM daily_prices WHERE symbol=? AND close IS NOT NULL ORDER BY trade_date DESC LIMIT 61",
          args: [symbol],
        }),
      ]);
      out.set(symbol, scoreForeignAccumulation(symbol, [...flowResult.rows], [...priceResult.rows]));
    }
  }
  return out;
}

export async function readForeignRadar(limit = 20, options: { includeSummary?: boolean } = {}) {
  const db = await database({ migrate: false });
  const result = await db.execute<RadarRow & { stock_name: string; market: string; close: number | null; ai_score: number | null }>({
    sql: `SELECT f.*,s.name AS stock_name,s.market,i.close,
      COALESCE(a.final_score,a.total_score) AS ai_score
      FROM foreign_accumulation_latest f
      JOIN stocks s ON s.symbol=f.symbol
      LEFT JOIN indicator_latest i ON i.symbol=f.symbol
      LEFT JOIN ai_analysis_latest a ON a.symbol=f.symbol
      WHERE f.data_days>=10
      ORDER BY f.accumulation_score DESC, f.buy_days_20 DESC, COALESCE(a.final_score,a.total_score,0) DESC
      LIMIT ?`,
    args: [Math.max(1, Math.min(100, limit))],
  });
  let summary = { covered: result.rows.length, usable: result.rows.length, latent: 0, strong: 0, latestDate: null as string | null };
  if (options.includeSummary !== false) {
    // Only the dedicated foreign-radar page asks for market-wide summary counts.
    // Smart Selection/Stealth pages skip this aggregate scan entirely.
    const counts = await db.execute<DatabaseRow>({
      sql: `SELECT COUNT(*) AS covered,
        SUM(CASE WHEN data_days>=10 THEN 1 ELSE 0 END) AS usable,
        SUM(CASE WHEN accumulation_score>=65 THEN 1 ELSE 0 END) AS latent,
        SUM(CASE WHEN accumulation_score>=82 THEN 1 ELSE 0 END) AS strong,
        MAX(trade_date) AS latest_date
        FROM foreign_accumulation_latest`,
    });
    summary = {
      covered: n(counts.rows[0]?.covered), usable: n(counts.rows[0]?.usable),
      latent: n(counts.rows[0]?.latent), strong: n(counts.rows[0]?.strong),
      latestDate: counts.rows[0]?.latest_date ? String(counts.rows[0]?.latest_date) : null,
    };
  } else {
    summary.latent = result.rows.filter((row) => n(row.accumulation_score) >= 65).length;
    summary.strong = result.rows.filter((row) => n(row.accumulation_score) >= 82).length;
    summary.latestDate = result.rows.reduce<string | null>((latest, row) => {
      const value = row.trade_date ? String(row.trade_date) : null;
      return !latest || (value && value > latest) ? value : latest;
    }, null);
  }
  return {
    summary,
    rows: result.rows.map((row) => ({
      ...fromRadarRow(row),
      stockName: String(row.stock_name ?? row.symbol), market: String(row.market ?? ""),
      close: row.close == null ? null : n(row.close), aiScore: row.ai_score == null ? null : n(row.ai_score),
    })),
  };
}


export async function readForeignRadarSymbols(symbolsInput:string[]) {
  const symbols=[...new Set(symbolsInput.map(String).filter(Boolean))].slice(0,100);
  if(!symbols.length) return {summary:{covered:0,usable:0,latent:0,strong:0,latestDate:null as string|null},rows:[] as any[]};
  const db=await database({migrate:false});
  const result=await db.execute<RadarRow & { stock_name:string; market:string; close:number|null; ai_score:number|null }>({
    sql:`SELECT f.*,s.name AS stock_name,s.market,i.close,
      COALESCE(a.final_score,a.total_score) AS ai_score
      FROM foreign_accumulation_latest f
      JOIN stocks s ON s.symbol=f.symbol
      LEFT JOIN indicator_latest i ON i.symbol=f.symbol
      LEFT JOIN ai_analysis_latest a ON a.symbol=f.symbol
      WHERE f.data_days>=10 AND f.symbol IN (${symbols.map(()=>"?").join(",")})
      ORDER BY f.accumulation_score DESC,f.buy_days_20 DESC,f.symbol`,
    args:symbols,
  });
  const rows=result.rows.map(row=>({
    ...fromRadarRow(row),stockName:String(row.stock_name??row.symbol),market:String(row.market??""),
    close:row.close==null?null:n(row.close),aiScore:row.ai_score==null?null:n(row.ai_score),
  }));
  return {
    summary:{covered:rows.length,usable:rows.length,latent:rows.filter(row=>n(row.score)>=65).length,strong:rows.filter(row=>n(row.score)>=82).length,latestDate:rows.reduce<string|null>((latest,row)=>!latest||(row.tradeDate&&row.tradeDate>latest)?row.tradeDate:latest,null)},
    rows,
  };
}

export async function priorityForeignSymbols(limit = 20): Promise<string[]> {
  const db = await database({ migrate: false });
  const result = await db.execute<{ symbol: string }>({
    sql: `SELECT p.symbol
      FROM (
        SELECT symbol,MIN(priority) AS priority FROM (
          SELECT symbol,0 AS priority FROM portfolio_lots WHERE user_name='bruce' AND status='open' AND remaining_lots>0
          UNION ALL SELECT symbol,1 FROM watchlist WHERE user_name='bruce'
          UNION ALL SELECT symbol,2 FROM hot_stock_candidates WHERE is_active=1
          UNION ALL SELECT symbol,3 FROM top30_snapshots WHERE snapshot_date=(SELECT MAX(snapshot_date) FROM top30_snapshots)
        ) WHERE symbol IS NOT NULL AND TRIM(symbol)<>'' GROUP BY symbol
      ) p
      LEFT JOIN foreign_accumulation_latest f ON f.symbol=p.symbol
      ORDER BY p.priority, COALESCE(f.calculated_at,'') ASC, p.symbol
      LIMIT ?`,
    args: [Math.max(1,Math.min(40,limit))],
  });
  return result.rows.map((row) => String(row.symbol));
}

export async function refreshForeignRadar(options: { symbols?: string[]; mode?: string } = {}) {
  const db = await database({ migrate: true });
  const symbols = options.symbols?.length ? [...new Set(options.symbols)] : await priorityForeignSymbols();
  const id = randomUUID(); const startedAt = new Date().toISOString();
  await db.execute({ sql: `INSERT INTO foreign_accumulation_runs(id,status,mode,total_symbols,started_at,updated_at) VALUES(?,?,?,?,?,?)`, args: [id,"running",options.mode ?? "priority",symbols.length,startedAt,startedAt] });
  let success = 0, failed = 0; let lastError: string | null = null;
  for (const symbol of symbols) {
    try { await refreshForeignAccumulationForSymbol(symbol, { db }); success += 1; }
    catch (error) { failed += 1; lastError = error instanceof Error ? error.message : String(error); }
    await db.execute({ sql: `UPDATE foreign_accumulation_runs SET processed_symbols=?,success_symbols=?,failed_symbols=?,current_symbol=?,updated_at=?,last_error=? WHERE id=?`, args: [success+failed,success,failed,symbol,new Date().toISOString(),lastError?.slice(0,900) ?? null,id] });
  }
  await db.execute({ sql: `UPDATE foreign_accumulation_runs SET status='completed',completed_at=?,updated_at=? WHERE id=?`, args: [new Date().toISOString(),new Date().toISOString(),id] });
  return { ok: true, runId: id, total: symbols.length, success, failed };
}
