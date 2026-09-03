import { randomUUID } from "node:crypto";
import type { DatabaseRow } from "@/lib/database";
import { TursoDatabaseAdapter } from "@/adapters/turso";
import { getTursoClient } from "@/lib/turso";
import { MigrationRunner } from "@/migrations/database/MigrationRunner";
import { tursoMigrations } from "@/migrations/turso";
import { MarketPipeline } from "@/services/scoring";

export type QueuePurpose = "hot-stock" | "watchlist" | "portfolio" | "daily" | "manual";

interface QueueRow extends DatabaseRow {
  id: string; symbol: string; purpose: string; priority: number; status: string;
  attempts: number; max_attempts: number; next_attempt_at: string | null;
  last_error_code: string | null; last_error_message: string | null;
  requested_at: string; started_at: string | null; completed_at: string | null; updated_at: string;
}

async function database() {
  const db = new TursoDatabaseAdapter(getTursoClient());
  await new MigrationRunner(db, tursoMigrations).migrate();
  return db;
}

function safeMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  if (/402|payment|required|rate.?limit|quota/i.test(raw)) {
    return { code: "UPSTREAM_RATE_LIMIT", message: "資料來源暫時達到使用額度，系統已排入稍後重試；既有 Turso 資料仍可正常顯示。", retryMinutes: 15 };
  }
  if (/timeout|fetch|network|ECONN/i.test(raw)) {
    return { code: "UPSTREAM_TEMPORARY", message: "資料來源暫時無法連線，系統已排入稍後重試。", retryMinutes: 5 };
  }
  return { code: "PROCESSING_ERROR", message: raw.slice(0, 500), retryMinutes: 10 };
}

export async function enqueueStockUpdate(input: { symbol: string; purpose?: QueuePurpose; priority?: number }) {
  const symbol = input.symbol.trim();
  if (!/^\d{4,6}$/.test(symbol)) throw new Error("股票代號格式不正確。");
  const db = await database();
  const stock = await db.execute<{ symbol: string }>({ sql: "SELECT symbol FROM stocks WHERE symbol=? AND is_active=1 LIMIT 1", args: [symbol] });
  if (!stock.rows[0]) throw new Error(`找不到有效股票代號 ${symbol}。`);
  const now = new Date().toISOString();
  const purpose = input.purpose ?? "manual";
  await db.execute({
    sql: `INSERT INTO update_queue(id,symbol,purpose,priority,status,attempts,max_attempts,next_attempt_at,requested_at,updated_at)
      VALUES(?,?,?,?, 'waiting',0,5,NULL,?,?)
      ON CONFLICT(symbol,purpose) DO UPDATE SET
        priority=MIN(update_queue.priority,excluded.priority),
        status=CASE WHEN update_queue.status='processing' THEN 'processing' ELSE 'waiting' END,
        next_attempt_at=NULL,last_error_code=NULL,last_error_message=NULL,
        requested_at=excluded.requested_at,updated_at=excluded.updated_at`,
    args: [randomUUID(), symbol, purpose, input.priority ?? 100, now, now],
  });
  return { symbol, purpose, status: "waiting" };
}

async function createSnapshot(db: TursoDatabaseAdapter, symbol: string, sourceEvent: string) {
  const row = await db.execute<any>({ sql: `SELECT i.trade_date,i.close,
      a.raw_score,a.market_adjustment,COALESCE(a.final_score,a.total_score) final_score,
      a.trend_score,a.momentum_score,a.volume_score,a.risk_score,a.confidence,a.reasons_json,a.algorithm_version,
      d.recommendation,d.target_1,d.target_2,d.stop_loss,d.expected_return,d.risk_reward
    FROM indicator_latest i
    LEFT JOIN ai_analysis_latest a ON a.symbol=i.symbol
    LEFT JOIN decision_latest d ON d.symbol=i.symbol
    WHERE i.symbol=? LIMIT 1`, args: [symbol] });
  const r = row.rows[0];
  if (!r?.trade_date) return;
  const version = String(r.algorithm_version ?? "M8.6");
  await db.execute({ sql: `INSERT INTO ai_snapshots(id,symbol,trade_date,model_version,close,raw_score,market_adjustment,final_score,trend_score,momentum_score,volume_score,risk_score,confidence,recommendation,target_1,target_2,stop_loss,expected_return,risk_reward,reasons_json,source_event,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(symbol,trade_date,model_version,source_event) DO UPDATE SET
      close=excluded.close,raw_score=excluded.raw_score,market_adjustment=excluded.market_adjustment,final_score=excluded.final_score,
      trend_score=excluded.trend_score,momentum_score=excluded.momentum_score,volume_score=excluded.volume_score,risk_score=excluded.risk_score,
      confidence=excluded.confidence,recommendation=excluded.recommendation,target_1=excluded.target_1,target_2=excluded.target_2,
      stop_loss=excluded.stop_loss,expected_return=excluded.expected_return,risk_reward=excluded.risk_reward,reasons_json=excluded.reasons_json,created_at=excluded.created_at`,
    args: [randomUUID(),symbol,String(r.trade_date),version,r.close,r.raw_score,r.market_adjustment,r.final_score,r.trend_score,r.momentum_score,r.volume_score,r.risk_score,r.confidence,r.recommendation,r.target_1,r.target_2,r.stop_loss,r.expected_return,r.risk_reward,r.reasons_json,sourceEvent,new Date().toISOString()] });
}

export async function processQueuedSymbol(symbol: string, purpose?: QueuePurpose) {
  const db = await database();
  const now = new Date().toISOString();
  const filterPurpose = purpose ? " AND purpose=?" : "";
  const args: any[] = [symbol]; if (purpose) args.push(purpose);
  const found = await db.execute<QueueRow>({ sql: `SELECT * FROM update_queue WHERE symbol=?${filterPurpose} ORDER BY priority,requested_at LIMIT 1`, args });
  const item = found.rows[0];
  if (!item) return { ok: false, symbol, status: "not-queued" };
  if (String(item.status) === "completed") return { ok: true, symbol, status: "completed", cached: true };
  await db.execute({ sql: "UPDATE update_queue SET status='processing',attempts=attempts+1,started_at=COALESCE(started_at,?),locked_at=?,locked_by=?,updated_at=? WHERE id=?", args: [now,now,"local-worker",now,String(item.id)] });
  try {
    const result = await new MarketPipeline(db).runSingleSymbol(symbol);
    if (result.success !== 1) throw new Error("分析未完成");
    await createSnapshot(db, symbol, String(item.purpose));
    const done = new Date().toISOString();
    await db.execute({ sql: "UPDATE update_queue SET status='completed',completed_at=?,locked_at=NULL,locked_by=NULL,last_error_code=NULL,last_error_message=NULL,updated_at=? WHERE id=?", args: [done,done,String(item.id)] });
    await db.execute({ sql: "UPDATE hot_stock_candidates SET status='completed',last_error=NULL,analyzed_at=?,updated_at=? WHERE symbol=?", args: [done,done,symbol] });
    return { ok: true, symbol, status: "completed", result };
  } catch (error) {
    const retry = safeMessage(error); const attempts = Number(item.attempts ?? 0) + 1;
    const terminal = attempts >= Number(item.max_attempts ?? 5);
    const next = new Date(Date.now() + retry.retryMinutes * 60_000).toISOString();
    const updated = new Date().toISOString();
    await db.execute({ sql: "UPDATE update_queue SET status=?,next_attempt_at=?,locked_at=NULL,locked_by=NULL,last_error_code=?,last_error_message=?,updated_at=? WHERE id=?", args: [terminal ? "failed" : "retrying", terminal ? null : next,retry.code,retry.message,updated,String(item.id)] });
    await db.execute({ sql: "UPDATE hot_stock_candidates SET status=?,last_error=?,updated_at=? WHERE symbol=?", args: [terminal ? "error" : "queued",retry.message,updated,symbol] });
    return { ok: false, symbol, status: terminal ? "failed" : "retrying", retryAt: terminal ? null : next, error: retry.message };
  }
}

export async function processUpdateQueue(limit = 1) {
  const db = await database(); const now = new Date().toISOString();
  const rows = await db.execute<QueueRow>({ sql: `SELECT * FROM update_queue
    WHERE status IN ('waiting','retrying') AND (next_attempt_at IS NULL OR next_attempt_at<=?)
    ORDER BY priority ASC, requested_at ASC LIMIT ?`, args: [now, Math.max(1, Math.min(limit, 10))] });
  const results=[]; for (const row of rows.rows) results.push(await processQueuedSymbol(String(row.symbol), String(row.purpose) as QueuePurpose));
  return { processed: results.length, results };
}

export async function getQueueStatus(symbol?: string) {
  const db = await database();
  if (symbol) {
    const result = await db.execute<QueueRow>({ sql: "SELECT * FROM update_queue WHERE symbol=? ORDER BY requested_at DESC", args: [symbol] });
    return result.rows;
  }
  const counts = await db.execute<any>({ sql: "SELECT status,COUNT(*) count FROM update_queue GROUP BY status" });
  const next = await db.execute<QueueRow>({ sql: "SELECT * FROM update_queue WHERE status IN ('waiting','retrying','processing') ORDER BY priority,requested_at LIMIT 20" });
  return { counts: counts.rows, next: next.rows };
}
