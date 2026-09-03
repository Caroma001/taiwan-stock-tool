import { NextRequest, NextResponse } from "next/server";
import { getCloudUpdateDiagnostics } from "@/lib/cloud/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const jobId = request.nextUrl.searchParams.get("jobId");
    const limitRaw = Number(request.nextUrl.searchParams.get("limit") ?? 20);
    const limit = Number.isFinite(limitRaw) ? Math.max(5, Math.min(100, Math.trunc(limitRaw))) : 20;
    const details = await getCloudUpdateDiagnostics(jobId, limit);
    return NextResponse.json(details, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[development/update/details]", error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
