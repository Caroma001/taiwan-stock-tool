import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db, USER_NAME, nowIso, today, asNumber, rowObject } from "@/lib/portfolio/turso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await db().execute({
      sql: `SELECT DISTINCT symbol
            FROM portfolio_lots
            WHERE user_name=? AND holding_type='test' AND status='open' AND remaining_lots>0
            ORDER BY symbol`,
      args: [USER_NAME],
    });
    return NextResponse.json({
      ok: true,
      symbols: result.rows.map((row) => String(rowObject(row).symbol)),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const symbol = String(body.symbol ?? "").trim();
    const buyPrice = asNumber(body.buyPrice);
    const buyDate = String(body.buyDate ?? today()).slice(0, 10);

    if (!symbol || buyPrice <= 0) {
      throw new Error("股票代號或測試起始價格不正確");
    }

    const stock = await db().execute({
      sql: "SELECT symbol,name FROM stocks WHERE symbol=? LIMIT 1",
      args: [symbol],
    });
    if (!stock.rows.length) throw new Error(`股票代號 ${symbol} 不存在於 Turso 股票主檔`);

    const duplicate = await db().execute({
      sql: `SELECT id FROM portfolio_lots
            WHERE user_name=? AND symbol=? AND holding_type='test'
              AND status='open' AND remaining_lots>0
            LIMIT 1`,
      args: [USER_NAME, symbol],
    });
    if (duplicate.rows.length) {
      return NextResponse.json({ ok: true, alreadyExists: true, symbol });
    }

    const now = nowIso();
    const id = randomUUID();
    await db().execute({
      sql: `INSERT INTO portfolio_lots(
              id,user_name,symbol,buy_date,buy_price,quantity_lots,remaining_lots,
              target_sell_price,fees,tax,note,holding_type,status,created_at,updated_at
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        id,
        USER_NAME,
        symbol,
        buyDate,
        buyPrice,
        1,
        1,
        null,
        0,
        0,
        "由 Top 30 加入測試觀察池；以加入當日收盤價模擬 1 張，不計手續費與稅。",
        "test",
        "open",
        now,
        now,
      ],
    });

    return NextResponse.json({
      ok: true,
      alreadyExists: false,
      item: { id, symbol, buyPrice, buyDate, quantityLots: 1 },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
