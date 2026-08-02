import { createTursoDatabase } from "@/lib/database/createTursoDatabase";
import type { DatabaseRow } from "@/lib/database";
import { getTursoClient } from "@/lib/turso/client";
import { TursoDatabaseAdapter } from "@/adapters/turso";
import { MarketPipeline } from "@/services/scoring";

interface HotStockRow extends DatabaseRow {
  symbol: string;
  stock_name: string;
  market: string;
  source: string;
  reason: string | null;
  status: string;
  last_error: string | null;
  added_at: string;
  analyzed_at: string | null;
  updated_at: string;
  close: number | null;
  trade_date: string | null;
  raw_score: number | null;
  market_adjustment: number | null;
  final_score: number | null;
  trend_score: number | null;
  momentum_score: number | null;
  volume_score: number | null;
  risk_score: number | null;
  confidence: number | null;
  recommendation: string | null;
  target_1: number | null;
  target_2: number | null;
  stop_loss: number | null;
  expected_return: number | null;
  risk_reward: number | null;
  reasons_json: string | null;
}

function n(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function listHotStocks() {
  const db = createTursoDatabase();
  const result = await db.execute<HotStockRow>({
      sql: `SELECT h.symbol, s.name AS stock_name, s.market, h.source, h.reason, h.status,
        h.last_error, h.added_at, h.analyzed_at, h.updated_at,
        i.close, i.trade_date,
        a.raw_score, a.market_adjustment, COALESCE(a.final_score,a.total_score) AS final_score,
        a.trend_score, a.momentum_score, a.volume_score, a.risk_score, a.confidence,
        d.recommendation, d.target_1, d.target_2, d.stop_loss, d.expected_return, d.risk_reward,
        a.reasons_json
      FROM hot_stock_candidates h
      JOIN stocks s ON s.symbol=h.symbol
      LEFT JOIN indicator_latest i ON i.symbol=h.symbol
      LEFT JOIN ai_analysis_latest a ON a.symbol=h.symbol
      LEFT JOIN decision_latest d ON d.symbol=h.symbol
      WHERE h.is_active=1
      ORDER BY h.added_at DESC`,
    });
  return result.rows.map((row) => {
      let reasons: string[] = [];
      try { const parsed = JSON.parse(String(row.reasons_json ?? "[]")); if (Array.isArray(parsed)) reasons = parsed.map(String); } catch {}
      return {
        symbol: String(row.symbol), stockName: String(row.stock_name ?? ""), market: String(row.market ?? ""),
        source: String(row.source ?? "manual"), reason: row.reason ? String(row.reason) : null,
        status: String(row.status ?? "waiting"), error: row.last_error ? String(row.last_error) : null,
        addedAt: String(row.added_at ?? ""), analyzedAt: row.analyzed_at ? String(row.analyzed_at) : null,
        tradeDate: row.trade_date ? String(row.trade_date) : null, close: n(row.close), rawScore: n(row.raw_score),
        marketAdjustment: n(row.market_adjustment), finalScore: n(row.final_score), trendScore: n(row.trend_score),
        momentumScore: n(row.momentum_score), volumeScore: n(row.volume_score), riskScore: n(row.risk_score),
        confidence: n(row.confidence), recommendation: row.recommendation ? String(row.recommendation) : null,
        target1: n(row.target_1), target2: n(row.target_2), stopLoss: n(row.stop_loss),
        expectedReturn: n(row.expected_return), riskReward: n(row.risk_reward), reasons,
      };
  });
}

export async function addHotStock(input: { symbol: string; reason?: string }) {
  const symbol = input.symbol.trim();
  if (!/^\d{4,6}$/.test(symbol)) throw new Error("股票代號格式不正確。請輸入 4～6 位數字。");
  const db = createTursoDatabase();
  const stock = await db.execute<DatabaseRow & { symbol: string; name: string; is_active: number }>({
      sql: "SELECT symbol,name,is_active FROM stocks WHERE symbol=? LIMIT 1", args: [symbol],
    });
    const row = stock.rows[0];
    if (!row) throw new Error(`找不到股票代號 ${symbol}。`);
    if (Number(row.is_active ?? 0) !== 1) throw new Error(`${symbol} ${row.name} 目前不是有效上市櫃股票。`);
    const now = new Date().toISOString();
    await db.execute({
      sql: `INSERT INTO hot_stock_candidates(symbol,source,reason,status,last_error,added_at,analyzed_at,updated_at,is_active)
        VALUES(?,?,?,'waiting',NULL,?,NULL,?,1)
        ON CONFLICT(symbol) DO UPDATE SET reason=excluded.reason,status='waiting',last_error=NULL,updated_at=excluded.updated_at,is_active=1`,
      args: [symbol, "manual", input.reason?.trim() || null, now, now],
    });
  return { symbol, stockName: String(row.name) };
}

export async function removeHotStock(symbol: string) {
  const db = createTursoDatabase();
  await db.execute({ sql: "UPDATE hot_stock_candidates SET is_active=0,updated_at=? WHERE symbol=?", args: [new Date().toISOString(), symbol] });
  return { symbol };
}

export async function analyzeHotStock(symbol: string) {
  if (!/^\d{4,6}$/.test(symbol)) throw new Error("股票代號格式不正確。");
  const client = getTursoClient();
  const db = new TursoDatabaseAdapter(client);
  const now = new Date().toISOString();
  try {
    const exists = await db.execute<DatabaseRow & { symbol: string }>({ sql: "SELECT symbol FROM hot_stock_candidates WHERE symbol=? AND is_active=1", args: [symbol] });
    if (!exists.rows[0]) throw new Error("此股票尚未加入熱門股候選池。");
    await db.execute({ sql: "UPDATE hot_stock_candidates SET status='processing',last_error=NULL,updated_at=? WHERE symbol=?", args: [now, symbol] });
    const result = await new MarketPipeline(db).runSingleSymbol(symbol);
    const completedAt = new Date().toISOString();
    const ok = result.success === 1;
    await db.execute({
      sql: "UPDATE hot_stock_candidates SET status=?,last_error=?,analyzed_at=?,updated_at=? WHERE symbol=?",
      args: [ok ? "completed" : "error", ok ? null : "分析未完成，請稍後重試。", ok ? completedAt : null, completedAt, symbol],
    });
    if (!ok) throw new Error("熱門股分析未完成，請查看 Pipeline 狀態。");
    return { ...result, symbol };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try { await db.execute({ sql: "UPDATE hot_stock_candidates SET status='error',last_error=?,updated_at=? WHERE symbol=?", args: [message.slice(0,900), new Date().toISOString(), symbol] }); } catch {}
    throw error;
  }
}
