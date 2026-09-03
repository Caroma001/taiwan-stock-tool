import { NextResponse } from "next/server";
import { syncBruceSelectionWatchPool } from "@/lib/smart-selection/watch-pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    return NextResponse.json(await syncBruceSelectionWatchPool());
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
