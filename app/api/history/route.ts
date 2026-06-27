import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { fetchFinMindStockPrice } from "@/app/lib/finmind";

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getDateYearsAgo(years = 2) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return toDateString(d);
}

function getToday() {
  return toDateString(new Date());
}

async function upsertPrices(symbol: string, prices: any[]) {
  let inserted = 0;

  for (const p of prices) {
    const close = Number(p.close);

    if (!p.date || !Number.isFinite(close)) {
      continue;
    }

    const { error } = await supabase.from("daily_prices").upsert(
      {
        symbol,
        trade_date: p.date,
        open: Number(p.open) || null,
        high: Number(p.max) || null,
        low: Number(p.min) || null,
        close,
        volume: Number(p.Trading_Volume) || null,
      },
      {
        onConflict: "symbol,trade_date",
      }
    );

    if (!error) inserted++;
  }

  return inserted;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const symbol = String(body.symbol || "").trim();

    if (!symbol) {
      return NextResponse.json(
        {
          success: false,
          inserted: 0,
          error: "缺少股票代號",
        },
        { status: 400 }
      );
    }

    const startDate = String(body.startDate || getDateYearsAgo(2));
    const endDate = String(body.endDate || getToday());

    const prices = await fetchFinMindStockPrice(symbol, startDate, endDate);

    if (!prices.length) {
      return NextResponse.json(
        {
          success: false,
          symbol,
          inserted: 0,
          error: "FinMind 找不到歷史股價資料",
        },
        { status: 404 }
      );
    }

    const inserted = await upsertPrices(symbol, prices);

    return NextResponse.json({
      success: true,
      source: "FinMind",
      symbol,
      startDate,
      endDate,
      fetched: prices.length,
      inserted,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        inserted: 0,
        error: String(error),
        source: "FinMind",
      },
      { status: 500 }
    );
  }
}