import { NextRequest, NextResponse } from "next/server";
import { addHotStock, listHotStocks, removeHotStock } from "@/lib/hot-stocks/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return NextResponse.json({ ok: true, rows: await listHotStocks() }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
}
export async function POST(request: NextRequest) {
  try { const body = await request.json(); return NextResponse.json({ ok: true, row: await addHotStock({ symbol: String(body.symbol ?? ""), reason: body.reason == null ? undefined : String(body.reason) }) }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 400 }); }
}
export async function DELETE(request: NextRequest) {
  try { const symbol = request.nextUrl.searchParams.get("symbol") ?? ""; return NextResponse.json({ ok: true, row: await removeHotStock(symbol) }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 400 }); }
}
