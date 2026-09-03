import { NextResponse } from "next/server";
import { getTursoClient } from "@/lib/turso/client";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
export async function GET() {
  try {
    const client = getTursoClient();
    const healthStarted = Date.now();
    const [version, schema] = await Promise.all([
      client.execute("SELECT sqlite_version() AS sqlite_version"),
      client.execute("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"),
    ]);
    // M8.10.9: never COUNT(*) every table simply because the maintenance page
    // was opened. That behavior can scan millions of historical rows. Table
    // names are enough for routine health monitoring; exact counts are omitted.
    const tables = schema.rows
      .map((item) => String((item as Row).name ?? ""))
      .filter((name) => /^[A-Za-z0-9_]+$/.test(name))
      .map((name) => ({ table_name: name, estimated_rows: null, total_bytes: 0, total_size: "省讀模式" }));

    return NextResponse.json({ ok: true, status: {
      databaseBytes: 0,
      databaseSize: "Turso 後台管理",
      usagePercentage: 0,
      checkedAt: new Date().toISOString(),
      adapter: "turso",
      latencyMs: Date.now() - healthStarted,
      sqliteVersion: String((version.rows[0] as Row | undefined)?.sqlite_version ?? "unknown"),
      tables,
      logs: [],
      efficiencyMode: true,
      settings: { auto_enabled: false, last_auto_run_at: null, last_auto_error: null },
    }});
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
