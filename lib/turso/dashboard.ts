import { getTursoClient } from "@/lib/turso/client";
import { readLatestMarket, readValidationCenter } from "@/lib/market/service";

export type DashboardTop30Row = {
  rank: number;
  symbol: string;
  stockName: string;
  market: string;
  tradeDate: string;
  close: number | null;
  totalScore: number;
  trendScore: number;
  momentumScore: number;
  volumeScore: number;
  riskScore: number;
  confidence: number;
  recommendation: string;
  target1: number | null;
  target2: number | null;
  stopLoss: number | null;
  expectedReturn: number | null;
  riskReward: number | null;
  reasons: string[];
  rawScore: number;
  marketFactor: number;
};

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function readM72Dashboard() {
  const client = getTursoClient();
  const started = Date.now();
  const [health, runResult, countResult, latestDateResult, topResult, market, validation] = await Promise.all([
    client.execute("SELECT sqlite_version() AS sqlite_version"),
    client.execute(`SELECT id, mode, status, stage, total_symbols, processed_symbols,
      success_symbols, failed_symbols, current_symbol, started_at, updated_at, completed_at, error
      FROM market_pipeline_runs ORDER BY started_at DESC LIMIT 1`),
    client.execute("SELECT COUNT(*) AS total FROM decision_latest"),
    client.execute("SELECT MAX(trade_date) AS trade_date FROM decision_latest"),
    client.execute(`SELECT
        t.rank, t.symbol, s.name AS stock_name, s.market,
        COALESCE(d.trade_date, t.snapshot_date) AS trade_date,
        t.close, t.total_score, COALESCE(t.raw_score,a.raw_score,a.total_score,t.total_score) AS raw_score,
        COALESCE(t.market_adjustment,a.market_adjustment,0) AS market_adjustment,
        COALESCE(t.market_score,a.market_score,50) AS market_score,
        COALESCE(t.market_regime,a.market_regime,'盤整') AS market_regime,
        COALESCE(t.algorithm_version,a.algorithm_version,'RULES-1') AS algorithm_version,
        COALESCE(a.trend_score, 0) AS trend_score,
        COALESCE(a.momentum_score, 0) AS momentum_score,
        COALESCE(a.volume_score, 0) AS volume_score,
        COALESCE(a.risk_score, 0) AS risk_score,
        t.confidence, t.recommendation,
        t.target_1, t.target_2, t.stop_loss,
        t.expected_return, t.risk_reward,
        COALESCE(a.reasons_json, '[]') AS reasons_json
      FROM top30_snapshots t
      JOIN stocks s ON s.symbol = t.symbol
      LEFT JOIN ai_analysis_latest a ON a.symbol = t.symbol
      LEFT JOIN decision_latest d ON d.symbol = t.symbol
      WHERE t.snapshot_date = (SELECT MAX(snapshot_date) FROM top30_snapshots)
      ORDER BY t.rank ASC LIMIT 30`),
    readLatestMarket(),
    readValidationCenter(),
  ]);

  const run = runResult.rows[0] ?? null;
  const total = numberValue(run?.total_symbols);
  const processed = numberValue(run?.processed_symbols);
  const percentage = total > 0 ? Math.min(100, (processed / total) * 100) : 0;
  const elapsedSeconds = run?.started_at ? Math.max(1, (Date.now() - Date.parse(String(run.started_at))) / 1000) : 0;
  const rate = processed > 0 ? processed / elapsedSeconds : 0;
  const etaSeconds = rate > 0 ? Math.max(0, Math.round((total - processed) / rate)) : 0;

  const rows: DashboardTop30Row[] = topResult.rows.map((row) => {
    let reasons: string[] = [];
    try {
      const parsed = JSON.parse(String(row.reasons_json ?? "[]"));
      if (Array.isArray(parsed)) reasons = parsed.map(String);
    } catch {}
    return {
      rank: numberValue(row.rank),
      symbol: String(row.symbol ?? ""),
      stockName: String(row.stock_name ?? ""),
      market: String(row.market ?? ""),
      tradeDate: String(row.trade_date ?? ""),
      close: row.close == null ? null : numberValue(row.close),
      totalScore: numberValue(row.total_score),
      trendScore: numberValue(row.trend_score),
      momentumScore: numberValue(row.momentum_score),
      volumeScore: numberValue(row.volume_score),
      riskScore: numberValue(row.risk_score),
      confidence: numberValue(row.confidence),
      recommendation: String(row.recommendation ?? "觀察"),
      target1: row.target_1 == null ? null : numberValue(row.target_1),
      target2: row.target_2 == null ? null : numberValue(row.target_2),
      stopLoss: row.stop_loss == null ? null : numberValue(row.stop_loss),
      expectedReturn: row.expected_return == null ? null : numberValue(row.expected_return),
      riskReward: row.risk_reward == null ? null : numberValue(row.risk_reward),
      reasons,
      rawScore: numberValue(row.raw_score),
      marketFactor: numberValue(row.market_adjustment),
    };
  });

  return {
    ok: true,
    database: {
      provider: "Turso",
      status: "healthy",
      latencyMs: Date.now() - started,
      sqliteVersion: String(health.rows[0]?.sqlite_version ?? "unknown"),
    },
    pipeline: {
      id: run ? String(run.id ?? "") : null,
      mode: run ? String(run.mode ?? "") : null,
      status: run ? String(run.status ?? "idle") : "idle",
      stage: run ? String(run.stage ?? "waiting") : "waiting",
      total,
      processed,
      success: numberValue(run?.success_symbols),
      failed: numberValue(run?.failed_symbols),
      currentSymbol: run?.current_symbol ? String(run.current_symbol) : null,
      percentage,
      etaSeconds,
      updatedAt: run?.updated_at ? String(run.updated_at) : null,
      error: run?.error ? String(run.error) : null,
    },
    summary: {
      analyzedCount: numberValue(countResult.rows[0]?.total),
      latestTradeDate: latestDateResult.rows[0]?.trade_date ? String(latestDateResult.rows[0].trade_date) : null,
      top30Count: rows.length,
    },
    market,
    validation: validation.summary,
    rows,
  };
}

export async function refreshM72Top30() {
  const client = getTursoClient();
  const latest = await client.execute("SELECT MAX(trade_date) AS trade_date FROM decision_latest");
  const snapshotDate = String(latest.rows[0]?.trade_date ?? new Date().toISOString().slice(0, 10));
  const createdAt = new Date().toISOString();
  await client.execute({ sql: "DELETE FROM top30_snapshots WHERE snapshot_date = ?", args: [snapshotDate] });
  await client.execute({
    sql: `INSERT INTO top30_snapshots (
      snapshot_date, rank, symbol, total_score, recommendation, close,
      target_1, target_2, stop_loss, expected_return, risk_reward, confidence, created_at,
      raw_score, market_adjustment, market_score, market_regime, algorithm_version
    )
    SELECT ?, ROW_NUMBER() OVER (ORDER BY COALESCE(a.final_score,a.total_score) DESC, d.confidence DESC, d.risk_reward DESC),
      d.symbol, COALESCE(a.final_score,a.total_score), d.recommendation, i.close,
      d.target_1, d.target_2, d.stop_loss, d.expected_return, d.risk_reward, d.confidence, ?,
      COALESCE(a.raw_score,a.total_score), COALESCE(a.market_adjustment,0), COALESCE(a.market_score,50),
      COALESCE(a.market_regime,'盤整'), COALESCE(a.algorithm_version,'RULES-1')
    FROM decision_latest d
    JOIN ai_analysis_latest a ON a.symbol = d.symbol
    LEFT JOIN indicator_latest i ON i.symbol = d.symbol
    WHERE d.recommendation IN ('強勢觀察','買進觀察','續抱')
    ORDER BY COALESCE(a.final_score,a.total_score) DESC, d.confidence DESC, d.risk_reward DESC
    LIMIT 30`,
    args: [snapshotDate, createdAt],
  });
  const result = await client.execute({ sql: "SELECT COUNT(*) AS total FROM top30_snapshots WHERE snapshot_date = ?", args: [snapshotDate] });
  return { snapshotDate, count: numberValue(result.rows[0]?.total) };
}
