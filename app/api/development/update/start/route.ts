import { NextRequest, NextResponse } from "next/server";
import { finalizeDevelopmentDailyUpdate, startDevelopmentDailyUpdate } from "@/lib/development/update-service";
import { ensureDevelopmentUpdateWorker } from "@/lib/development/update-worker";
import { isVercelRuntime, publishDailyUpdate } from "@/lib/vercel/update-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({} as { reset?: boolean }));
    const update = await startDevelopmentDailyUpdate({ reset: Boolean(body.reset) });

    if (!update.jobId) {
      return NextResponse.json(update);
    }

    if (update.alreadyCompleted) {
      // An M8.10.6 upgrade may happen after today's market job already finished.
      // Pressing the single Daily Update button must still ensure the unified
      // chip/Winner25/Stealth post-processing exists for that completed job.
      const finalization = await finalizeDevelopmentDailyUpdate(update.jobId);
      return NextResponse.json({ ...update, finalization, message: "今日市場資料已完成；Winner25/法人潛伏底層評分、Risk Intelligence 與 Swing10 後處理同步完成。" });
    }

    if (isVercelRuntime()) {
      const processed = Number((update as { processed?: unknown }).processed ?? 0);
      const queue = await publishDailyUpdate(
        {
          jobId: update.jobId,
          requestedAt: new Date().toISOString(),
          source: update.resumed ? "resume" : "manual",
          role: "work",
          generation: 1,
          expectedProcessed: processed,
        },
        0,
        `${update.jobId}:start:${processed}`,
      );
      return NextResponse.json({ ...update, execution: "vercel-queue", queue });
    }

    const worker = ensureDevelopmentUpdateWorker(update.jobId);
    return NextResponse.json({ ...update, execution: "local-worker", worker });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
