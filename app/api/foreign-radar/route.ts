import { NextRequest, NextResponse } from "next/server";
import { readForeignRadar } from "@/lib/foreign-accumulation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? 20);
    const radar = await readForeignRadar(limit);
    return NextResponse.json({ ok: true, ...radar });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error), summary: { covered: 0, usable: 0, latent: 0, strong: 0, latestDate: null }, rows: [] },
      { status: 500 },
    );
  }
}
