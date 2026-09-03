import { NextRequest, NextResponse } from "next/server";
import { refreshForeignRadar } from "@/lib/foreign-accumulation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const symbols = Array.isArray(body.symbols)
      ? body.symbols.map(String).filter((symbol: string) => /^\d{4,6}$/.test(symbol))
      : undefined;
    const result = await refreshForeignRadar({ symbols, mode: symbols?.length ? "selected" : "priority" });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
