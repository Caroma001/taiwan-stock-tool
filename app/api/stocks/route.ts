import { NextResponse } from "next/server";
import {
  fetchFinMindStockInfo,
  fetchFinMindStockPrice,
} from "@/app/lib/finmind";

function getDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getStartDate(daysBack = 10) {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return getDateString(d);
}

function normalizeMarket(market: string | null | undefined) {
  const text = String(market || "").toLowerCase();

  if (
    text.includes("上市") ||
    text.includes("twse") ||
    text.includes("sii")
  ) {
    return "TWSE";
  }

  if (
    text.includes("上櫃") ||
    text.includes("tpex") ||
    text.includes("otc")
  ) {
    return "TPEX";
  }

  if (text.includes("興櫃")) {
    return "EMERGING";
  }

  return "UNKNOWN";
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = String(searchParams.get("symbol") || "").trim();

    if (!symbol) {
      return NextResponse.json(
        {
          error: "請提供股票代號",
        },
        { status: 400 }
      );
    }

    const info = await fetchFinMindStockInfo(symbol);

    const prices = await fetchFinMindStockPrice(symbol, getStartDate(14));

    if (!prices.length) {
      return NextResponse.json(
        {
          error: "找不到交易資料",
          symbol,
          source: "FinMind",
        },
        { status: 404 }
      );
    }

    const latest = prices[prices.length - 1];

    const name =
      info?.stock_name ||
      info?.name ||
      info?.industry_category ||
      symbol;

    const market =
      normalizeMarket(info?.type || info?.market || info?.exchange);

    return NextResponse.json({
      symbol,
      name,
      market,
      industry: info?.industry_category || "",
      trade_date: latest.date,
      date: latest.date,
      open: Number(latest.open),
      high: Number(latest.max),
      low: Number(latest.min),
      max: Number(latest.max),
      min: Number(latest.min),
      close: Number(latest.close),
      volume: Number(latest.Trading_Volume),
      source: "FinMind",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: String(error),
        source: "FinMind",
      },
      { status: 500 }
    );
  }
}