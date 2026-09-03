import { NextRequest, NextResponse } from "next/server";
import { retryTerminalCloudFailures } from "@/lib/cloud/jobs";
import { ensureDevelopmentUpdateWorker } from "@/lib/development/update-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  try {
    let body: { jobId?: string } = {};
    try { body = await request.json(); } catch { body = {}; }
    const result = await retryTerminalCloudFailures(body.jobId ?? null);
    const jobId = typeof result.jobId === "string" ? result.jobId : null;
    const worker = jobId && Number(result.pending ?? 0) > 0
      ? ensureDevelopmentUpdateWorker(jobId)
      : null;
    return NextResponse.json({ ...result, worker }, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[development/update/retry-failed]", error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
