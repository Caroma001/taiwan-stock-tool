import { NextRequest, NextResponse } from "next/server";
import { analyzeHotStock } from "@/lib/hot-stocks/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function POST(request: NextRequest) {
  try { const body = await request.json(); const result = await analyzeHotStock(String(body.symbol ?? "")); return NextResponse.json({ ok: true, result }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
}
