import { NextResponse } from "next/server";
import { getTursoClient } from "@/lib/turso/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const required = ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"];
  const missing = required.filter((name) => !process.env[name]);

  if (missing.length) {
    return NextResponse.json(
      { ok: false, error: "Missing required environment variables", missing },
      { status: 503 },
    );
  }

  const started = Date.now();

  try {
    const result = await getTursoClient().execute(
      "select sqlite_version() as version",
    );

    return NextResponse.json({
      ok: true,
      database: "turso",
      mode: "personal-login-free",
      latencyMs: Date.now() - started,
      sqliteVersion: result.rows[0]?.version ?? null,
      time: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        database: "turso",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 503 },
    );
  }
}
