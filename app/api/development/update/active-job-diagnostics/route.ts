import { NextResponse } from "next/server";
import { TursoDatabaseAdapter } from "@/adapters/turso";
import { getTursoClient } from "@/lib/turso";
import { MigrationRunner } from "@/migrations/database/MigrationRunner";
import { tursoMigrations } from "@/migrations/turso";
import { getActiveJobDiagnostics } from "@/lib/cloud/active-job";
import { resolveEffectiveTradingDate } from "@/lib/development/trading-date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const db = new TursoDatabaseAdapter(getTursoClient());
    await new MigrationRunner(db, tursoMigrations).migrate();
    const tradingDate = await resolveEffectiveTradingDate();
    const diagnostics = await getActiveJobDiagnostics(db, tradingDate.jobDate);
    return NextResponse.json({
      ...diagnostics,
      version: "M8.10.20",
      calendarDate: tradingDate.calendarDate,
      effectiveTradingDate: tradingDate.effectiveTradingDate,
      tradingDateSource: tradingDate.source,
      tradingDateReason: tradingDate.reason,
      marketClosedToday: tradingDate.marketClosedToday,
    }, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[active-job-diagnostics]", error);
    return NextResponse.json({ ok: false, version: "M8.10.20", error: message }, { status: 500 });
  }
}
