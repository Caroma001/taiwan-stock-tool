import { NextRequest, NextResponse } from "next/server";
import { getStealthRadarCohortStatus, getStealthRadarTop20ForTest, rebuildStealthRadarTop20TestPool } from "@/lib/portfolio/stealth-test-pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, no-cache, max-age=0, must-revalidate");
  return response;
}

export async function GET() {
  try {
    const cohort = await getStealthRadarCohortStatus();
    let candidates: unknown[] = [];
    if (cohort.canCreateNext) {
      try { candidates = await getStealthRadarTop20ForTest(); } catch { candidates = []; }
    }
    return json({ ok: true, cohort, candidateCount: candidates.length, candidates });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    return json(await rebuildStealthRadarTop20TestPool({ force: Boolean(body?.force) }));
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 409 });
  }
}
