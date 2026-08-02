import { NextResponse } from "next/server";
import { getTursoClient } from "@/lib/turso/client";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const missing = ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "APP_ACCESS_PASSWORD", "AUTH_SESSION_SECRET", "CLOUD_ADMIN_SECRET", "CRON_SECRET"].filter((name) => !process.env[name]);
  if (missing.length) return NextResponse.json({ ok: false, error: "Missing production environment variables", missing }, { status: 503 });
  const started = Date.now();
  try {
    const result = await getTursoClient().execute("select sqlite_version() as version");
    return NextResponse.json({ ok: true, database: "turso", latencyMs: Date.now() - started, sqliteVersion: result.rows[0]?.version ?? null, time: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json({ ok: false, database: "turso", error: error instanceof Error ? error.message : String(error) }, { status: 503 });
  }
}
