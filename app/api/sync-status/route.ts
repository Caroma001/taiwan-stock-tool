import { NextResponse } from "next/server";
import { getTursoClient } from "@/lib/turso/client";

export const dynamic = "force-dynamic";
const n = (value: unknown) => Number(value ?? 0);

export async function GET() {
  try {
    const client = getTursoClient();
    // M8.10.9: the old sync monitor performed COUNT(*)/COUNT(DISTINCT) over the
    // entire daily_prices table every five seconds. The monitor now reads only
    // compact latest/snapshot tables. Historical row count is intentionally not
    // calculated on a live polling endpoint.
    const [run, runs, priceSummary] = await Promise.all([
      client.execute(`SELECT * FROM market_pipeline_runs ORDER BY started_at DESC LIMIT 1`),
      client.execute(`SELECT * FROM market_pipeline_runs ORDER BY started_at DESC LIMIT 20`),
      client.execute(`SELECT trade_date AS latest_trade_date FROM indicator_latest ORDER BY trade_date DESC LIMIT 1`),
    ]);
    const row = run.rows[0] ?? {};
    const total = n(row.total_symbols);
    const processed = n(row.processed_symbols);
    return NextResponse.json({
      ok: true,
      current: { ...row, percentage: total ? (processed / total) * 100 : 0 },
      taskCounts: [],
      priceSummary: {
        symbols: total || null,
        rows: null,
        latestTradeDate: String(priceSummary.rows[0]?.latest_trade_date ?? ""),
        source: "indicator_latest",
      },
      runs: runs.rows,
      efficiencyMode: true,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
