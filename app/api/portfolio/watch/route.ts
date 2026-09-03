import { NextRequest, NextResponse } from "next/server";
import { db, USER_NAME, nowIso } from "@/lib/portfolio/turso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const symbol = String(body.symbol ?? "").trim();
    if (!symbol) throw new Error("缺少股票代號");

    const client = db();
    // M8.11.8 Unified Watchlist Source of Truth:
    // cancelling from Portfolio must clear both the canonical watchlist and legacy pool.
    await client.execute({
      sql: "DELETE FROM watchlist WHERE user_name=? AND symbol=?",
      args: [USER_NAME, symbol],
    });
    await client.execute({
      sql: "UPDATE hot_stock_candidates SET is_active=0,status='cancelled',updated_at=? WHERE symbol=? AND is_active=1",
      args: [nowIso(), symbol],
    });

    return NextResponse.json({ ok: true, symbol, unified: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
