import { NextResponse } from "next/server";
import { getTursoClient } from "@/lib/turso/client";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0);

export async function GET() {
  try {
    const client = getTursoClient();
    const healthStarted = Date.now();
    const version = await client.execute("SELECT sqlite_version() AS sqlite_version");
    const schema = await client.execute("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    const tables = [] as Array<{ table_name: string; estimated_rows: number; total_bytes: number; total_size: string }>;
    for (const item of schema.rows) {
      const name = String((item as Row).name ?? "");
      if (!/^[A-Za-z0-9_]+$/.test(name)) continue;
      const result = await client.execute(`SELECT COUNT(*) AS count FROM "${name}"`);
      tables.push({ table_name: name, estimated_rows: n((result.rows[0] as Row | undefined)?.count), total_bytes: 0, total_size: "Turso 管理" });
    }
    let databaseBytes = 0;
    try {
      const pc = await client.execute("PRAGMA page_count");
      const ps = await client.execute("PRAGMA page_size");
      const first = (r: typeof pc) => n(Object.values((r.rows[0] as Row | undefined) ?? {})[0]);
      databaseBytes = first(pc) * first(ps);
    } catch { databaseBytes = 0; }
    return NextResponse.json({ ok: true, status: {
      databaseBytes,
      databaseSize: databaseBytes ? `${(databaseBytes / 1024 / 1024).toFixed(2)} MB` : "由 Turso 後台管理",
      usagePercentage: 0,
      checkedAt: new Date().toISOString(),
      adapter: "turso",
      latencyMs: Date.now() - healthStarted,
      sqliteVersion: String((version.rows[0] as Row | undefined)?.sqlite_version ?? "unknown"),
      tables,
      logs: [],
      settings: { auto_enabled: false, last_auto_run_at: null, last_auto_error: null },
    }});
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
