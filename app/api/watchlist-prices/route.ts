import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";

type WatchRow = {
  symbol: string;
  name: string | null;
};

type FinMindPriceRow = {
  date?: string;
  stock_id?: string | number;
  Trading_Volume?: number;
  open?: number;
  max?: number;
  min?: number;
  close?: number;
};

const KEEP_DAYS = 75;

function getStartDate(daysBack = KEEP_DAYS + 10) {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

function getKeepDate(daysBack = KEEP_DAYS) {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

async function getTargets(singleSymbol?: string) {
  let query = supabase
    .from("watchlist")
    .select("symbol,name")
    .eq("user_name", "Bruce")
    .eq("is_active", true)
    .eq("enabled", true)
    .order("priority", { ascending: false })
    .order("symbol", { ascending: true });

  if (singleSymbol) query = query.eq("symbol", singleSymbol);

  const { data, error } = await query;
  if (error) throw new Error(`讀取 watchlist 失敗：${error.message}`);

  return (data ?? []) as WatchRow[];
}

async function fetchFinMindPrices(symbol: string) {
  const params = new URLSearchParams({
    dataset: "TaiwanStockPrice",
    data_id: symbol,
    start_date: getStartDate(),
  });

  const token = process.env.FINMIND_API_TOKEN;
  if (token) params.set("token", token);

  const url = `https://api.finmindtrade.com/api/v4/data?${params.toString()}`;

  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();

  if (!res.ok || json.status !== 200) {
    throw new Error(json.msg || `FinMind request failed: ${res.status}`);
  }

  const rows = (json.data ?? []) as FinMindPriceRow[];

  return rows
    .filter((r) => r.date)
    .map((r) => ({
      symbol,
      trade_date: String(r.date).slice(0, 10),
      open: Number(r.open ?? 0),
      high: Number(r.max ?? 0),
      low: Number(r.min ?? 0),
      close: Number(r.close ?? 0),
      volume: Number(r.Trading_Volume ?? 0),
    }))
    .filter((r) => r.close > 0)
    .sort((a, b) => a.trade_date.localeCompare(b.trade_date))
    .slice(-KEEP_DAYS);
}

async function updateOne(symbol: string) {
  const rows = await fetchFinMindPrices(symbol);

  if (!rows.length) {
    return {
      symbol,
      success: false,
      inserted: 0,
      error: "找不到股價資料",
    };
  }

  const { error } = await supabase.from("daily_prices").upsert(rows, {
    onConflict: "symbol,trade_date",
  });

  if (error) {
    throw new Error(`${symbol} 寫入 daily_prices 失敗：${error.message}`);
  }

  return {
    symbol,
    success: true,
    inserted: rows.length,
    latestDate: rows.at(-1)?.trade_date ?? null,
    latestClose: rows.at(-1)?.close ?? null,
  };
}

async function cleanOldData() {
  const keepDate = getKeepDate();

  const { data: targets, error: targetError } = await supabase
    .from("watchlist")
    .select("symbol")
    .eq("user_name", "Bruce")
    .eq("is_active", true)
    .eq("enabled", true);

  if (targetError) {
    throw new Error(`讀取清理清單失敗：${targetError.message}`);
  }

  const symbols = (targets ?? []).map((x) => x.symbol);

  if (!symbols.length) return;

  const { error: priceError } = await supabase
    .from("daily_prices")
    .delete()
    .in("symbol", symbols)
    .lt("trade_date", keepDate);

  if (priceError) {
    throw new Error(`清理 daily_prices 失敗：${priceError.message}`);
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message:
      "Watchlist Prices API is ready. Use POST to update Watchlist price data.",
    keepDays: KEEP_DAYS,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const singleSymbol = body.symbol ? String(body.symbol).trim() : "";

    const targets = await getTargets(singleSymbol || undefined);
    const results = [];

    for (const target of targets) {
      try {
        results.push(await updateOne(target.symbol));
      } catch (error) {
        results.push({
          symbol: target.symbol,
          success: false,
          error: String(error),
        });
      }
    }

    await cleanOldData();

    const successCount = results.filter((r: any) => r.success).length;

    return NextResponse.json({
      success: successCount > 0,
      keepDays: KEEP_DAYS,
      total: results.length,
      successCount,
      failedCount: results.length - successCount,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}