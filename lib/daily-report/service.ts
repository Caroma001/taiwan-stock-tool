import { TursoDatabaseAdapter } from "@/adapters/turso";
import { getTursoClient } from "@/lib/turso";
import type { DatabaseAdapter, DatabaseRow } from "@/lib/database";
import { MigrationRunner } from "@/migrations/database/MigrationRunner";
import { tursoMigrations } from "@/migrations/turso";
import { resolveEffectiveTradingDate } from "@/lib/development/trading-date";

const VERSION = "M8.12.3";
const USER_NAME = "Bruce";
const TRAINING_SCHEMA = "twstock-daily-training-v1";
const n = (v: unknown, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const nullable = (v: unknown) => v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
const text = (v: unknown) => String(v ?? "").trim();
const round = (v: number, d = 1) => Number(v.toFixed(d));
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const jsonArray = (v: unknown): string[] => { try { const x = JSON.parse(text(v) || "[]"); return Array.isArray(x) ? x.map(String) : []; } catch { return []; } };
const jsonObject = <T>(v: unknown, fallback: T): T => { try { const x = JSON.parse(text(v) || ""); return x && typeof x === "object" ? x as T : fallback; } catch { return fallback; } };

async function database(migrate = true) {
  const db = new TursoDatabaseAdapter(getTursoClient());
  if (migrate) await new MigrationRunner(db, tursoMigrations).migrate();
  return db;
}

function dateDiffDays(a: string, b: string) {
  const x = Date.parse(`${a}T12:00:00+08:00`), y = Date.parse(`${b}T12:00:00+08:00`);
  return Number.isFinite(x) && Number.isFinite(y) ? Math.max(0, Math.round((x - y) / 86400000)) : null;
}
function pct(v: number | null, d = 2) { return v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`; }
function stockName(row: DatabaseRow) { return text(row.stock_name) || text(row.name) || text(row.symbol); }

export type TrainingTargets = {
  status: "pending" | "mature" | "partial";
  return1d: number | null;
  return3d: number | null;
  return5d: number | null;
  return10d: number | null;
  maxGain5d: number | null;
  maxGain10d: number | null;
  maxDrawdown5d: number | null;
  maxDrawdown10d: number | null;
  hit5PctBy5d: boolean | null;
  hit8PctBy10d: boolean | null;
  hitStopLossBy10d: boolean | null;
};

export type TrainingRecord = {
  symbol: string;
  stockName: string;
  close: number | null;
  source: { earlyWatch: boolean; swing10: boolean; fast5: boolean };
  earlyWatch: null | Record<string, unknown>;
  swing10: null | Record<string, unknown>;
  fast5: null | Record<string, unknown>;
  market: Record<string, unknown>;
  targets: TrainingTargets;
};

export type DailyIntegratedReport = {
  version: string;
  reportDate: string;
  generatedAt: string;
  market: {
    verdict: string; posture: "normal" | "caution" | "defensive" | "high-risk";
    riskScore: number | null; riskLevel: string; riskReasons: string[];
    taiex: { date: string | null; close: number | null; changePct: number | null; return5Pct: number | null; drawdown20Pct: number | null };
    global: { date: string | null; marketScore: number | null; regime: string; riskLevel: string; confidence: number | null; reasons: string[] };
    international: Array<{ symbol: string; name: string; quoteDate: string; close: number | null; changePct: number | null; ageDays: number | null; stale: boolean; valid: boolean; issue: string | null }>;
    dataWarning: string | null;
  };
  earlyWatch: { total: number; ewA: number; ewB: number; top5: Array<Record<string, unknown>> };
  swing10: { total: number; a1: number; a0: number; riskChanged: number; top5: Array<Record<string, unknown>>; aRows: Array<Record<string, unknown>> };
  fastTrack: { title: string; note: string; top5: Array<Record<string, unknown>> };
  positions: { open: number; sellCheck: number; watch: number; hold: number; rows: Array<Record<string, unknown>> };
  training: {
    schemaVersion: string;
    recordCount: number;
    eligible: boolean;
    eligibilityReasons: string[];
    labelStatus: "pending" | "mature" | "partial";
    availableFutureSessions: number;
    maturedAt: string | null;
    records: TrainingRecord[];
  };
  conclusion: { headline: string; points: string[] };
  summaryText: string;
  sourceDates: Record<string, string | null>;
};

export type DailyReportExportStatus = {
  reportDate: string;
  jsonDownloadedAt: string | null;
  jsonDownloadCount: number;
  jsonDownloadedSignature: string | null;
  txtDownloadedAt: string | null;
  txtDownloadCount: number;
  lastFilename: string | null;
};

export type DailyReportScheduleStatus = {
  timezone: "Asia/Taipei";
  cutoff: "15:00";
  calendarDate: string;
  effectiveTradingDate: string;
  marketClosedToday: boolean;
  beforeSafeClose: boolean;
  state: "waiting_1500" | "market_closed" | "awaiting_pipeline" | "ready" | "historical";
  message: string;
};

function marketPosture(risk: number | null) {
  const s = risk ?? 50;
  if (s >= 85) return { posture: "high-risk" as const, verdict: "高風險防守" };
  if (s >= 72) return { posture: "defensive" as const, verdict: "防守／降低追價" };
  if (s >= 55) return { posture: "caution" as const, verdict: "謹慎選股" };
  return { posture: "normal" as const, verdict: "正常尋找機會" };
}

function fastTrackScore(row: DatabaseRow, early: DatabaseRow | undefined) {
  const swing = n(row.swing10_score), decision = n(row.decision_score), stealth = n(row.stealth_score), trigger = n(row.trigger_score), foreign = n(row.foreign_persistence_score, 50);
  const ew = early ? n(early.early_watch_score) : 0;
  const d1 = nullable(row.decision_delta_1d) ?? 0;
  const price20 = nullable(row.price20_pct) ?? nullable(early?.price_20_pct);
  const risk = nullable(row.market_risk_score) ?? 50;
  let score = swing * .38 + decision * .18 + stealth * .12 + trigger * .14 + foreign * .10 + ew * .08;
  score += clamp(d1 * .75, -7, 7);
  if (text(row.grade) === "A1") score += 6;
  else if (text(row.grade) === "A0") score += 3;
  if (price20 != null && price20 > 15) score -= Math.min(12, (price20 - 15) * .7);
  if (risk >= 85) score -= 8; else if (risk >= 72) score -= 4; else if (risk <= 45) score += 2;
  score = round(clamp(score), 1);
  const stage = text(row.grade) === "A1" ? "A1 可交易候選" : text(row.grade) === "A0" ? "A0 等待確認" : score >= 58 ? "快速觀察" : "等待改善";
  const reasons = [
    `Swing10 ${round(swing, 1)}`,
    `Decision ${round(decision, 1)}${d1 ? `（Δ1 ${d1 >= 0 ? "+" : ""}${round(d1, 1)}）` : ""}`,
    `發動 ${round(trigger, 0)}`,
    `外資續航 ${round(foreign, 0)}`,
    early ? `Early ${round(ew, 0)} / ${text(early.tier)}` : "尚未進 Early Watch 前段",
    `大盤風險 ${round(risk, 0)}`,
  ];
  return { score, stage, reasons };
}

function quoteQuality(row: DatabaseRow) {
  const symbol = text(row.symbol);
  const close = nullable(row.close);
  const change = nullable(row.change_pct);
  if (close == null || close <= 0) return { valid: false, issue: `${symbol} close=${close ?? "null"} 非有效正值` };
  const limit = symbol === "USDTWD" ? 8 : symbol === "TW_NIGHT" ? 15 : symbol === "SOX" ? 25 : 80;
  if (change != null && Math.abs(change) > limit) return { valid: false, issue: `${symbol} 單日變動 ${round(change, 2)}% 超過品質上限 ${limit}%` };
  return { valid: true, issue: null as string | null };
}

async function resolveReportDate(db: DatabaseAdapter, requested?: string | null) {
  const trading = await resolveEffectiveTradingDate();
  const requestedValid = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : null;
  if (requestedValid && requestedValid > trading.effectiveTradingDate) {
    throw new Error(`正式日報以台北時間 15:00 為資料鎖定點；${requestedValid} 尚未成為完整交易日。`);
  }
  const upper = requestedValid ?? trading.effectiveTradingDate;
  const r = await db.execute<DatabaseRow>({ sql: `SELECT MAX(d) AS d FROM (
    SELECT MAX(trade_date) AS d FROM swing10_candidate_daily WHERE trade_date<=?
    UNION ALL SELECT MAX(trade_date) FROM early_watch_daily WHERE trade_date<=?
    UNION ALL SELECT MAX(trade_date) FROM market_index_daily WHERE index_code='TAIEX' AND trade_date<=?
  )`, args: [upper, upper, upper] });
  const d = text(r.rows[0]?.d);
  if (!d) throw new Error("尚無可建立綜合日報的交易日，請先完成每日一鍵更新。");
  return d;
}

function emptyTargets(): TrainingTargets {
  return { status: "pending", return1d: null, return3d: null, return5d: null, return10d: null, maxGain5d: null, maxGain10d: null, maxDrawdown5d: null, maxDrawdown10d: null, hit5PctBy5d: null, hit8PctBy10d: null, hitStopLossBy10d: null };
}

async function priceMapForDate(db: DatabaseAdapter, reportDate: string, symbols: string[]) {
  const map = new Map<string, number | null>();
  if (!symbols.length) return map;
  const placeholders = symbols.map(() => "?").join(",");
  const rows = await db.execute<DatabaseRow>({ sql: `SELECT symbol,close FROM daily_prices WHERE trade_date=? AND symbol IN (${placeholders})`, args: [reportDate, ...symbols] });
  for (const row of rows.rows) map.set(text(row.symbol), nullable(row.close));
  return map;
}

function buildTrainingRecords(input: {
  reportDate: string;
  earlyRows: DatabaseRow[];
  swingRows: DatabaseRow[];
  fastTop: Array<Record<string, unknown>>;
  prices: Map<string, number | null>;
  marketRisk: number | null;
  marketLevel: string;
  taiexChange: number | null;
  taiexReturn5: number | null;
  taiexDrawdown20: number | null;
  globalScore: number | null;
  globalRegime: string;
}) {
  const early = new Map(input.earlyRows.map(row => [text(row.symbol), row]));
  const swing = new Map(input.swingRows.map(row => [text(row.symbol), row]));
  const fast = new Map(input.fastTop.map(row => [text(row.symbol), row]));
  const symbols = [...new Set([...early.keys(), ...swing.keys()])].sort();
  return symbols.map<TrainingRecord>(symbol => {
    const e = early.get(symbol), s = swing.get(symbol), f = fast.get(symbol);
    const name = stockName(s ?? e ?? ({ symbol } as DatabaseRow));
    return {
      symbol, stockName: name, close: input.prices.get(symbol) ?? null,
      source: { earlyWatch: Boolean(e), swing10: Boolean(s), fast5: Boolean(f) },
      earlyWatch: e ? {
        rank: n(e.candidate_rank), tier: text(e.tier), score: n(e.early_watch_score), fundamental: n(e.fundamental_score), catalyst: n(e.catalyst_score), priceNotPriced: n(e.price_not_priced_score), accumulation: n(e.accumulation_score), technical: n(e.technical_setup_score), revenueMonth: text(e.revenue_data_month) || null, revenueYoy: nullable(e.revenue_yoy_pct), revenueMom: nullable(e.revenue_mom_pct), revenueCumulativeYoy: nullable(e.revenue_cumulative_yoy_pct), revenueYoyAcceleration: nullable(e.revenue_yoy_acceleration), price20Pct: nullable(e.price_20_pct), foreign20: nullable(e.foreign_20), foreignBuyDays20: nullable(e.foreign_buy_days_20), mutedPrice: nullable(e.muted_price_score), foreignAcceleration: nullable(e.foreign_acceleration_score), sourceConfidence: nullable(e.source_confidence_pct),
      } : null,
      swing10: s ? {
        rank: n(s.candidate_rank), grade: text(s.grade), score: n(s.swing10_score), decision: nullable(s.decision_score), decisionDelta1d: nullable(s.decision_delta_1d), decisionDelta3d: nullable(s.decision_delta_3d), rankDelta1d: nullable(s.rank_delta_1d), potential: nullable(s.potential_score), stealth: nullable(s.stealth_score), breakout: nullable(s.breakout_score), trigger: nullable(s.trigger_score), marginWashout: nullable(s.margin_washout_score), foreignPersistence: nullable(s.foreign_persistence_score), daytradeRatio: nullable(s.daytrade_ratio_pct), daytradeNoisePenalty: nullable(s.daytrade_noise_penalty), riskConfidence: nullable(s.risk_data_confidence_pct), entryGatePass: n(s.entry_gate_pass) === 1, riskChange: text(s.risk_change_level),
      } : null,
      fast5: f ? { rank: n(f.rank), score: n(f.score), stage: text(f.stage) } : null,
      market: { reportDate: input.reportDate, riskScore: input.marketRisk, riskLevel: input.marketLevel, taiexChangePct: input.taiexChange, taiexReturn5Pct: input.taiexReturn5, taiexDrawdown20Pct: input.taiexDrawdown20, globalMarketScore: input.globalScore, globalRegime: input.globalRegime },
      targets: emptyTargets(),
    };
  });
}

async function hydrateTrainingLabelsIfMature(db: DatabaseAdapter, report: DailyIntegratedReport) {
  if (!report.training?.records?.length || report.training.labelStatus === "mature") return report;
  const dates = await db.execute<DatabaseRow>({ sql: "SELECT DISTINCT trade_date FROM daily_prices WHERE trade_date>? ORDER BY trade_date ASC LIMIT 10", args: [report.reportDate] });
  const futureDates = dates.rows.map(row => text(row.trade_date)).filter(Boolean);
  report.training.availableFutureSessions = futureDates.length;
  if (futureDates.length < 10) return report;

  const symbols = report.training.records.map(row => row.symbol).filter(Boolean);
  if (!symbols.length) return report;
  const placeholders = symbols.map(() => "?").join(",");
  const tenthDate = futureDates[9];
  const future = await db.execute<DatabaseRow>({ sql: `SELECT symbol,trade_date,high,low,close FROM daily_prices WHERE trade_date>? AND trade_date<=? AND symbol IN (${placeholders}) ORDER BY symbol,trade_date`, args: [report.reportDate, tenthDate, ...symbols] });
  const bySymbol = new Map<string, DatabaseRow[]>();
  for (const row of future.rows) {
    const symbol = text(row.symbol); const rows = bySymbol.get(symbol) ?? []; rows.push(row); bySymbol.set(symbol, rows);
  }
  let matureCount = 0;
  for (const rec of report.training.records) {
    const base = rec.close;
    const rows = bySymbol.get(rec.symbol) ?? [];
    if (base == null || base <= 0 || rows.length < 10) { rec.targets.status = "partial"; continue; }
    const closeAt = (i: number) => nullable(rows[i - 1]?.close);
    const ret = (i: number) => { const c = closeAt(i); return c == null ? null : round((c / base - 1) * 100, 2); };
    const windowStats = (days: number) => {
      const window = rows.slice(0, days);
      const highs = window.map(r => nullable(r.high)).filter((v): v is number => v != null);
      const lows = window.map(r => nullable(r.low)).filter((v): v is number => v != null);
      return { gain: highs.length ? round((Math.max(...highs) / base - 1) * 100, 2) : null, drawdown: lows.length ? round((Math.min(...lows) / base - 1) * 100, 2) : null };
    };
    const w5 = windowStats(5), w10 = windowStats(10);
    rec.targets = {
      status: "mature", return1d: ret(1), return3d: ret(3), return5d: ret(5), return10d: ret(10),
      maxGain5d: w5.gain, maxGain10d: w10.gain, maxDrawdown5d: w5.drawdown, maxDrawdown10d: w10.drawdown,
      hit5PctBy5d: w5.gain == null ? null : w5.gain >= 5,
      hit8PctBy10d: w10.gain == null ? null : w10.gain >= 8,
      hitStopLossBy10d: w10.drawdown == null ? null : w10.drawdown <= -4.5,
    };
    matureCount += 1;
  }
  report.training.labelStatus = matureCount === report.training.records.length ? "mature" : "partial";
  report.training.maturedAt = new Date().toISOString();
  await db.execute({ sql: "UPDATE daily_analysis_reports SET report_json=?,updated_at=? WHERE report_date=?", args: [JSON.stringify(report), new Date().toISOString(), report.reportDate] });
  return report;
}

export async function generateDailyIntegratedReport(db: DatabaseAdapter, requestedDate?: string | null): Promise<DailyIntegratedReport> {
  const reportDate = await resolveReportDate(db, requestedDate);
  const [swing, early, regime, quotes, taiex, positions] = await Promise.all([
    db.execute<DatabaseRow>({ sql: "SELECT * FROM swing10_candidate_daily WHERE trade_date=? ORDER BY candidate_rank LIMIT 20", args: [reportDate] }),
    db.execute<DatabaseRow>({ sql: "SELECT * FROM early_watch_daily WHERE trade_date=? ORDER BY candidate_rank LIMIT 30", args: [reportDate] }),
    db.execute<DatabaseRow>({ sql: "SELECT * FROM market_regime_daily WHERE regime_date<=? ORDER BY regime_date DESC LIMIT 1", args: [reportDate] }),
    db.execute<DatabaseRow>({ sql: `WITH x AS (SELECT symbol,MAX(quote_date) d FROM market_quotes_daily WHERE quote_date<=? GROUP BY symbol)
      SELECT q.* FROM market_quotes_daily q JOIN x ON x.symbol=q.symbol AND x.d=q.quote_date
      WHERE q.symbol IN ('SOX','TW_NIGHT','USDTWD','VIX')
      ORDER BY CASE q.symbol WHEN 'SOX' THEN 1 WHEN 'TW_NIGHT' THEN 2 WHEN 'USDTWD' THEN 3 WHEN 'VIX' THEN 4 ELSE 5 END`, args: [reportDate] }),
    db.execute<DatabaseRow>({ sql: "SELECT trade_date,close,change_pct FROM market_index_daily WHERE index_code='TAIEX' AND trade_date<=? ORDER BY trade_date DESC LIMIT 20", args: [reportDate] }),
    db.execute<DatabaseRow>({ sql: `WITH latest_alert AS (
      SELECT a.* FROM swing10_exit_alert_daily a JOIN (
        SELECT lot_id,MAX(trade_date) trade_date FROM swing10_exit_alert_daily WHERE trade_date<=? GROUP BY lot_id
      ) x ON x.lot_id=a.lot_id AND x.trade_date=a.trade_date
    )
    SELECT pl.symbol,s.name AS stock_name,sp.holding_type,pl.buy_price,pl.remaining_lots,a.current_price,a.return_pct,a.current_grade,a.action,a.reasons_json,a.trade_date
    FROM swing10_trade_positions sp JOIN portfolio_lots pl ON pl.id=sp.lot_id
    LEFT JOIN stocks s ON s.symbol=pl.symbol LEFT JOIN latest_alert a ON a.lot_id=sp.lot_id
    WHERE pl.user_name=? AND pl.status='open' AND pl.remaining_lots>0
    ORDER BY CASE COALESCE(a.action,'hold') WHEN 'sell_check' THEN 1 WHEN 'watch' THEN 2 ELSE 3 END,pl.symbol`, args: [reportDate, USER_NAME] }),
  ]);

  const swingRows = [...swing.rows];
  const earlyRows = [...early.rows];
  const earlyMap = new Map<string, DatabaseRow>(earlyRows.map(r => [text(r.symbol), r]));
  const marketRisk = nullable(swingRows[0]?.market_risk_score);
  const marketLevel = text(swingRows[0]?.market_risk_level) || "待補";
  const posture = marketPosture(marketRisk);
  const riskReasons = jsonArray(swingRows[0]?.reasons_json).filter(x => x.includes("TAIEX") || x.includes("全球市場")).slice(0, 5);

  const taiexRows = [...taiex.rows].reverse();
  const latestTaiex = taiexRows.at(-1);
  const latestClose = nullable(latestTaiex?.close);
  const prev5 = taiexRows.length >= 6 ? nullable(taiexRows.at(-6)?.close) : null;
  const ret5 = latestClose != null && prev5 ? round((latestClose / prev5 - 1) * 100, 2) : null;
  const closes = taiexRows.map(r => nullable(r.close)).filter((x): x is number => x != null);
  const high20 = closes.length ? Math.max(...closes) : null;
  const dd20 = latestClose != null && high20 ? round((latestClose / high20 - 1) * 100, 2) : null;

  const regimeRow = regime.rows[0];
  const international = quotes.rows.map(row => {
    const qd = text(row.quote_date); const age = dateDiffDays(reportDate, qd); const quality = quoteQuality(row);
    return { symbol: text(row.symbol), name: text(row.display_name), quoteDate: qd, close: nullable(row.close), changePct: nullable(row.change_pct), ageDays: age, stale: age != null && age > 3, valid: quality.valid, issue: quality.issue };
  });
  const stale = international.filter(x => x.stale);
  const invalid = international.filter(x => !x.valid);
  const warnings: string[] = [];
  if (stale.length) warnings.push(`國際行情有 ${stale.length} 項日期較舊：${stale.map(x => `${x.name} ${x.quoteDate}`).join("、")}`);
  if (invalid.length) warnings.push(`排除 ${invalid.length} 項異常行情：${invalid.map(x => x.issue).join("；")}`);
  const dataWarning = warnings.length ? warnings.join("；") : null;
  const effectiveGlobalScore = invalid.length ? null : nullable(regimeRow?.market_score);
  const effectiveGlobalRegime = invalid.length ? "資料品質待修" : text(regimeRow?.regime) || "待補";
  const effectiveGlobalRisk = invalid.length ? "待修" : text(regimeRow?.risk_level) || "待補";
  const globalReasons = international.map(q => q.valid ? `${q.name} ${pct(q.changePct)}` : `${q.name} ⚠ ${q.issue}`).slice(0, 6);

  const earlyTop = earlyRows.slice(0, 5).map(r => ({ rank: n(r.candidate_rank), symbol: text(r.symbol), stockName: stockName(r), tier: text(r.tier), score: n(r.early_watch_score), fundamental: n(r.fundamental_score), catalyst: n(r.catalyst_score), priceNotPriced: n(r.price_not_priced_score), accumulation: n(r.accumulation_score), revenueYoy: nullable(r.revenue_yoy_pct), price20Pct: nullable(r.price_20_pct), reasons: jsonArray(r.reasons_json).slice(0, 3) }));
  const relativeTop = swingRows.slice(0, 5).map(r => ({ rank: n(r.candidate_rank), symbol: text(r.symbol), stockName: stockName(r), grade: text(r.grade), swing10: n(r.swing10_score), decision: n(r.decision_score), decisionDelta1d: nullable(r.decision_delta_1d), stealth: nullable(r.stealth_score), trigger: nullable(r.trigger_score), foreign: nullable(r.foreign_persistence_score), marketRisk: nullable(r.market_risk_score), marketPosture: marketPosture(nullable(r.market_risk_score)).verdict, reasons: jsonArray(r.reasons_json).slice(0, 3) }));
  const aRows = swingRows.filter(r => ["A1", "A0"].includes(text(r.grade))).map(r => ({ rank: n(r.candidate_rank), symbol: text(r.symbol), stockName: stockName(r), grade: text(r.grade), swing10: n(r.swing10_score), decision: n(r.decision_score), decisionDelta1d: nullable(r.decision_delta_1d), trigger: nullable(r.trigger_score), foreign: nullable(r.foreign_persistence_score), marketRisk: nullable(r.market_risk_score) }));
  const fastTop = swingRows.map(r => ({ r, fit: fastTrackScore(r, earlyMap.get(text(r.symbol))) })).sort((a, b) => b.fit.score - a.fit.score).slice(0, 5).map(({ r, fit }, i) => ({ rank: i + 1, symbol: text(r.symbol), stockName: stockName(r), grade: text(r.grade), score: fit.score, stage: fit.stage, swing10: n(r.swing10_score), decision: n(r.decision_score), decisionDelta1d: nullable(r.decision_delta_1d), trigger: nullable(r.trigger_score), foreign: nullable(r.foreign_persistence_score), marketRisk: nullable(r.market_risk_score), earlyTier: text(earlyMap.get(text(r.symbol))?.tier) || null, earlyScore: nullable(earlyMap.get(text(r.symbol))?.early_watch_score), reasons: fit.reasons }));
  const positionRows = positions.rows.map(r => ({ symbol: text(r.symbol), stockName: stockName(r), type: text(r.holding_type), buyPrice: nullable(r.buy_price), currentPrice: nullable(r.current_price), returnPct: nullable(r.return_pct), grade: text(r.current_grade) || "—", action: text(r.action) || "hold", alertDate: text(r.trade_date) || null, reasons: jsonArray(r.reasons_json) }));

  const a1 = aRows.filter(r => r.grade === "A1").length, a0 = aRows.filter(r => r.grade === "A0").length;
  const ewA = earlyRows.filter(r => text(r.tier) === "EW-A").length, ewB = earlyRows.filter(r => text(r.tier) === "EW-B").length;
  const sellCheck = positionRows.filter(r => r.action === "sell_check").length, watch = positionRows.filter(r => r.action === "watch").length, hold = positionRows.filter(r => r.action === "hold").length;
  const headline = a1 + a0 > 0 ? `今日有 ${a1} 檔 A1、${a0} 檔 A0；先依市場風險決定部位大小。` : `今日沒有正式 A1/A0 買點；這代表 Entry Gate 偏防守，不代表全市場沒有上漲股票。`;

  const uniqueSymbols = [...new Set([...earlyRows.map(r => text(r.symbol)), ...swingRows.map(r => text(r.symbol))].filter(Boolean))];
  const prices = await priceMapForDate(db, reportDate, uniqueSymbols);
  const trainingEligible = invalid.length === 0;
  const eligibilityReasons = trainingEligible ? ["國際行情通過資料品質檢查", "正式資料日已鎖定"] : ["存在異常國際行情，暫不納入策略訓練", ...invalid.map(x => x.issue ?? x.symbol)];
  const trainingRecords = buildTrainingRecords({ reportDate, earlyRows, swingRows, fastTop, prices, marketRisk, marketLevel, taiexChange: nullable(latestTaiex?.change_pct), taiexReturn5: ret5, taiexDrawdown20: dd20, globalScore: effectiveGlobalScore, globalRegime: effectiveGlobalRegime });

  const points = [
    `市場：${posture.verdict}；大盤風險 ${marketRisk == null ? "待補" : `${round(marketRisk, 0)}/100`}，TAIEX ${pct(nullable(latestTaiex?.change_pct))}。`,
    `Early Watch：EW-A ${ewA} 檔、EW-B ${ewB} 檔；用來提早觀察，不直接視為買點。`,
    `Swing10：A1 ${a1} 檔、A0 ${a0} 檔；相對 Top5 仍保留，避免把「沒有正式買點」誤解成「沒有相對強股」。`,
    `持股：賣出檢查 ${sellCheck}、注意 ${watch}、續抱 ${hold}。`,
    `訓練資料：${trainingRecords.length} 檔特徵快照；滿 10 個後續交易日後補 1/3/5/10 日報酬與最大漲跌標籤。`,
    `Fast5 是 5–10 日「準備度」排序，用於縮小研究範圍；尚未經足夠 OOS 樣本驗證，不等同保證獲利。`,
  ];
  if (dataWarning) points.push(dataWarning);

  const lines = [
    `【TWSTOCK ${VERSION} 每日綜合分析｜${reportDate}】`,
    `市場結論：${posture.verdict}｜大盤風險 ${marketRisk == null ? "—" : round(marketRisk, 0)}/100｜TAIEX ${latestClose == null ? "—" : latestClose.toLocaleString("zh-TW")} (${pct(nullable(latestTaiex?.change_pct))})｜5日 ${pct(ret5)}｜20日回撤 ${pct(dd20)}`,
    `國際風向：${effectiveGlobalRegime}｜市場分數 ${effectiveGlobalScore == null ? "—" : round(effectiveGlobalScore, 0)}｜${international.map(q => `${q.name} ${q.valid ? pct(q.changePct) : "⚠異常排除"}[${q.quoteDate}]`).join("；") || "待補"}`,
    `選股漏斗：Early EW-A ${ewA} / EW-B ${ewB} → Swing10 A0 ${a0} / A1 ${a1}。`,
    `正式結論：${headline}`,
    `Fast5：${fastTop.map(x => `${x.rank}.${x.symbol} ${x.stockName} ${x.score}分/${x.stage}`).join("；") || "無"}`,
    `相對Top5：${relativeTop.map(x => `${x.rank}.${x.symbol} ${x.stockName} ${x.grade} S${x.swing10}`).join("；") || "無"}`,
    `持股提醒：賣出檢查 ${sellCheck}｜注意 ${watch}｜續抱 ${hold}。`,
    `訓練資料：${trainingRecords.length} records｜${trainingEligible ? "可納入" : "暫停使用（資料品質）"}｜標籤 pending，滿10交易日自動成熟。`,
    dataWarning ? `資料提醒：${dataWarning}` : "資料提醒：國際行情日期與數值未發現明顯異常。",
    `備註：Fast5 為研究型 5–10 日準備度排序，不是獲利保證或自動下單訊號。`,
  ];

  const generatedAt = new Date().toISOString();
  const report: DailyIntegratedReport = {
    version: VERSION, reportDate, generatedAt,
    market: { verdict: posture.verdict, posture: posture.posture, riskScore: marketRisk, riskLevel: marketLevel, riskReasons, taiex: { date: text(latestTaiex?.trade_date) || null, close: latestClose, changePct: nullable(latestTaiex?.change_pct), return5Pct: ret5, drawdown20Pct: dd20 }, global: { date: text(regimeRow?.regime_date) || null, marketScore: effectiveGlobalScore, regime: effectiveGlobalRegime, riskLevel: effectiveGlobalRisk, confidence: invalid.length ? null : nullable(regimeRow?.confidence), reasons: globalReasons }, international, dataWarning },
    earlyWatch: { total: earlyRows.length, ewA, ewB, top5: earlyTop },
    swing10: { total: swingRows.length, a1, a0, riskChanged: swingRows.filter(r => ["watch", "high"].includes(text(r.risk_change_level))).length, top5: relativeTop, aRows },
    fastTrack: { title: "Fast5｜5–10日快速獲利準備度", note: "整合 Swing10、Decision 加速度、發動、法人續航、Early Watch 與市場風險；僅作研究排序，不直接改寫 A0/A1 Entry Gate。", top5: fastTop },
    positions: { open: positionRows.length, sellCheck, watch, hold, rows: positionRows },
    training: { schemaVersion: TRAINING_SCHEMA, recordCount: trainingRecords.length, eligible: trainingEligible, eligibilityReasons, labelStatus: "pending", availableFutureSessions: 0, maturedAt: null, records: trainingRecords },
    conclusion: { headline, points },
    summaryText: lines.join("\n"),
    sourceDates: { taiex: text(latestTaiex?.trade_date) || null, global: text(regimeRow?.regime_date) || null, earlyWatch: earlyRows[0] ? text(earlyRows[0].trade_date) : null, swing10: swingRows[0] ? text(swingRows[0].trade_date) : null },
  };
  const now = generatedAt;
  await db.execute({ sql: `INSERT INTO daily_analysis_reports(report_date,report_json,summary_text,source_dates_json,version,generated_at,updated_at)
    VALUES(?,?,?,?,?,?,?) ON CONFLICT(report_date) DO UPDATE SET report_json=excluded.report_json,summary_text=excluded.summary_text,source_dates_json=excluded.source_dates_json,version=excluded.version,generated_at=excluded.generated_at,updated_at=excluded.updated_at`, args: [reportDate, JSON.stringify(report), report.summaryText, JSON.stringify(report.sourceDates), VERSION, generatedAt, now] });
  return report;
}

async function readExportStatus(db: DatabaseAdapter, reportDate: string): Promise<DailyReportExportStatus> {
  const r = await db.execute<DatabaseRow>({ sql: "SELECT * FROM daily_report_export_status WHERE report_date=? LIMIT 1", args: [reportDate] });
  const row = r.rows[0];
  return { reportDate, jsonDownloadedAt: row?.json_downloaded_at ? text(row.json_downloaded_at) : null, jsonDownloadCount: n(row?.json_download_count), jsonDownloadedSignature: row?.json_downloaded_signature ? text(row.json_downloaded_signature) : null, txtDownloadedAt: row?.txt_downloaded_at ? text(row.txt_downloaded_at) : null, txtDownloadCount: n(row?.txt_download_count), lastFilename: row?.last_filename ? text(row.last_filename) : null };
}

async function scheduleStatus(reportDate: string, requestedDate?: string | null): Promise<DailyReportScheduleStatus> {
  const t = await resolveEffectiveTradingDate();
  if (requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) && reportDate < t.effectiveTradingDate) return { timezone: "Asia/Taipei", cutoff: "15:00", calendarDate: t.calendarDate, effectiveTradingDate: t.effectiveTradingDate, marketClosedToday: t.marketClosedToday, beforeSafeClose: t.beforeSafeClose, state: "historical", message: `正在查看歷史正式日報 ${reportDate}；每日正式資料鎖定時間仍為 15:00。` };
  if (t.marketClosedToday) return { timezone: "Asia/Taipei", cutoff: "15:00", calendarDate: t.calendarDate, effectiveTradingDate: t.effectiveTradingDate, marketClosedToday: true, beforeSafeClose: t.beforeSafeClose, state: "market_closed", message: `今日 ${t.calendarDate} 為休市日；目前使用最近完整交易日 ${reportDate}。` };
  if (t.beforeSafeClose) return { timezone: "Asia/Taipei", cutoff: "15:00", calendarDate: t.calendarDate, effectiveTradingDate: t.effectiveTradingDate, marketClosedToday: false, beforeSafeClose: true, state: "waiting_1500", message: `今日正式資料固定於台北時間 15:00 後產出；目前顯示最近完整交易日 ${reportDate}。` };
  if (reportDate < t.effectiveTradingDate) return { timezone: "Asia/Taipei", cutoff: "15:00", calendarDate: t.calendarDate, effectiveTradingDate: t.effectiveTradingDate, marketClosedToday: false, beforeSafeClose: false, state: "awaiting_pipeline", message: `已過 15:00，${t.effectiveTradingDate} 自動更新正在等待／執行；目前仍顯示 ${reportDate}。` };
  return { timezone: "Asia/Taipei", cutoff: "15:00", calendarDate: t.calendarDate, effectiveTradingDate: t.effectiveTradingDate, marketClosedToday: false, beforeSafeClose: false, state: "ready", message: `${reportDate} 正式收盤資料已鎖定，可下載 JSON 訓練檔。` };
}

export async function refreshDailyIntegratedReport(reportDate?: string | null) {
  const db = await database(true);
  return generateDailyIntegratedReport(db, reportDate);
}

export async function markDailyReportDownloaded(reportDate: string, format: "json" | "txt", filename?: string | null, signature?: string | null) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) throw new Error("無效報告日期");
  const db = await database(true); const now = new Date().toISOString();
  if (format === "json") {
    await db.execute({ sql: `INSERT INTO daily_report_export_status(report_date,json_downloaded_at,json_download_count,json_downloaded_signature,last_filename,updated_at)
      VALUES(?,?,1,?,?,?) ON CONFLICT(report_date) DO UPDATE SET json_downloaded_at=excluded.json_downloaded_at,json_download_count=daily_report_export_status.json_download_count+1,json_downloaded_signature=excluded.json_downloaded_signature,last_filename=excluded.last_filename,updated_at=excluded.updated_at`, args: [reportDate, now, signature ?? null, filename ?? `twstock-${reportDate}-daily-training.json`, now] });
  } else {
    await db.execute({ sql: `INSERT INTO daily_report_export_status(report_date,txt_downloaded_at,txt_download_count,last_filename,updated_at)
      VALUES(?,?,1,?,?) ON CONFLICT(report_date) DO UPDATE SET txt_downloaded_at=excluded.txt_downloaded_at,txt_download_count=daily_report_export_status.txt_download_count+1,last_filename=excluded.last_filename,updated_at=excluded.updated_at`, args: [reportDate, now, filename ?? `twstock-${reportDate}-daily-summary.txt`, now] });
  }
  return readExportStatus(db, reportDate);
}

export async function readDailyIntegratedReport(requestedDate?: string | null) {
  const db = await database(true);
  const reportDate = await resolveReportDate(db, requestedDate);
  const cached = await db.execute<DatabaseRow>({ sql: "SELECT report_json FROM daily_analysis_reports WHERE report_date=? LIMIT 1", args: [reportDate] });
  let report: DailyIntegratedReport | null = null;
  if (cached.rows[0]?.report_json) report = jsonObject<DailyIntegratedReport>(cached.rows[0].report_json, null as unknown as DailyIntegratedReport);
  if (!report || report.version !== VERSION || !report.training) report = await generateDailyIntegratedReport(db, reportDate);
  report = await hydrateTrainingLabelsIfMature(db, report);
  const [history, exportStatus, schedule] = await Promise.all([
    db.execute<DatabaseRow>({ sql: `SELECT r.report_date,r.generated_at,e.json_downloaded_at,e.json_download_count FROM daily_analysis_reports r LEFT JOIN daily_report_export_status e ON e.report_date=r.report_date ORDER BY r.report_date DESC LIMIT 60` }),
    readExportStatus(db, reportDate),
    scheduleStatus(reportDate, requestedDate),
  ]);
  const jsonBytes = Buffer.byteLength(JSON.stringify(report, null, 2), "utf8");
  const exportSignature = `${report.version}:${report.generatedAt}:${report.training.labelStatus}:${report.training.maturedAt ?? "pending"}`;
  return { ok: true, report, history: history.rows.map(r => ({ date: text(r.report_date), generatedAt: text(r.generated_at), jsonDownloadedAt: r.json_downloaded_at ? text(r.json_downloaded_at) : null, jsonDownloadCount: n(r.json_download_count) })), exportStatus, schedule, jsonBytes, exportSignature };
}
