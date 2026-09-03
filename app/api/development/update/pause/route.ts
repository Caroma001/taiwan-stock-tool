import { NextResponse } from "next/server";
import { assertDevelopmentMode } from "@/lib/development/config";
import { stopDevelopmentUpdateWorker } from "@/lib/development/update-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    assertDevelopmentMode();
    return NextResponse.json(stopDevelopmentUpdateWorker());
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
