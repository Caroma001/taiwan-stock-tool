import { NextRequest, NextResponse } from "next/server";
import { assertDevelopmentMode } from "@/lib/development/config";
import { runDevelopmentUpdateStep } from "@/lib/development/update-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    assertDevelopmentMode();
    const body = await request.json();
    const jobId = String(body.jobId ?? "").trim();
    if (!jobId) throw new Error("缺少更新工作編號");
    return NextResponse.json(await runDevelopmentUpdateStep(jobId));
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
