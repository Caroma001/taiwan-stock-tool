import { NextResponse } from "next/server";
import { finalizeDevelopmentDailyUpdate, startDevelopmentDailyUpdate } from "@/lib/development/update-service";
import { resolveEffectiveTradingDate } from "@/lib/development/trading-date";
import { ensureDevelopmentUpdateWorker } from "@/lib/development/update-worker";
import { isVercelRuntime, publishDailyUpdate } from "@/lib/vercel/update-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  try {
    // M8.11.10: no scheduled-route password is required. The endpoint is deliberately
    // guarded by trading-day / safe-close checks and the update service is
    // idempotent, so repeated requests reuse the same daily job instead of
    // creating duplicate full-market updates.
    const trading = await resolveEffectiveTradingDate();
    if (trading.marketClosedToday) {
      return NextResponse.json({ ok: true, scheduled: false, reason: "market_closed", trading });
    }
    if (trading.beforeSafeClose) {
      return NextResponse.json({ ok: true, scheduled: false, reason: "before_1500_taipei", trading });
    }

    const update = await startDevelopmentDailyUpdate({ reset: false });
    if (!update.jobId) return NextResponse.json({ ...update, scheduled: false, trading });

    if (update.alreadyCompleted) {
      const finalization = await finalizeDevelopmentDailyUpdate(update.jobId);
      return NextResponse.json({ ...update, scheduled: true, reusedCompletedJob: true, finalization, trading });
    }

    if (isVercelRuntime()) {
      const processed = Number((update as { processed?: unknown }).processed ?? 0);
      const queue = await publishDailyUpdate({
        jobId: update.jobId,
        requestedAt: new Date().toISOString(),
        source: "scheduled",
        role: "work",
        generation: 1,
        expectedProcessed: processed,
      }, 0, `${update.jobId}:scheduled-close:${processed}`);
      return NextResponse.json({ ...update, scheduled: true, execution: "vercel-queue", queue, trading });
    }

    const worker = ensureDevelopmentUpdateWorker(update.jobId);
    return NextResponse.json({ ...update, scheduled: true, execution: "local-worker", worker, trading });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
