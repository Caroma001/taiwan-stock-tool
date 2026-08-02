import { NextRequest, NextResponse } from "next/server";
import { getTursoClient } from "@/lib/turso/client";
export const dynamic = "force-dynamic";

const allowed = new Set(["tasks_7d", "logs_30d", "ai_history_30d", "ranking_30d", "all_safe"]);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = String(body.action ?? "");
    if (body.confirmation !== "CLEAN" || !allowed.has(action)) {
      return NextResponse.json({ ok: false, error: "Invalid maintenance request." }, { status: 400 });
    }
    const client = getTursoClient();
    let rowsDeleted = 0;
    const exists = async (table: string) => {
      const r = await client.execute({ sql: "SELECT 1 FROM sqlite_schema WHERE type='table' AND name=? LIMIT 1", args: [table] });
      return r.rows.length > 0;
    };
    const run = async (table: string, sql: string) => {
      if (!(await exists(table))) return;
      const result = await client.execute(sql);
      rowsDeleted += Number(result.rowsAffected ?? 0);
    };
    if (action === "tasks_7d" || action === "all_safe") {
      await run("market_pipeline_tasks", "DELETE FROM market_pipeline_tasks WHERE status IN ('completed','failed') AND updated_at < datetime('now','-7 day')");
    }
    if (action === "logs_30d" || action === "all_safe") {
      await run("market_pipeline_runs", "DELETE FROM market_pipeline_runs WHERE status IN ('completed','failed') AND updated_at < datetime('now','-30 day')");
    }
    if (action === "ai_history_30d" || action === "all_safe") {
      await run("validation_metrics_daily", "DELETE FROM validation_metrics_daily WHERE metric_date < date('now','-90 day')");
    }
    if (action === "ranking_30d" || action === "all_safe") {
      await run("top30_snapshots", "DELETE FROM top30_snapshots WHERE snapshot_date < date('now','-90 day')");
    }
    try { await client.execute("PRAGMA optimize"); } catch {}
    return NextResponse.json({ ok: true, result: { action, rowsDeleted, completedAt: new Date().toISOString() } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
