import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import {
  calculateAccumulationScore,
  type ForeignRow,
  type PriceRow,
} from "@/app/lib/accumulationEngine";

type WatchlistRow = {
  symbol: string;
  name: string | null;
  sector: string | null;
  group_name: string | null;
  priority: number | null;
};

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

async function getWatchlistTargets() {
  const { data, error } = await supabase
    .from("watchlist")
    .select("symbol,name,sector,group_name,priority")
    .eq("user_name", "Bruce")
    .eq("is_active", true)
    .eq("enabled", true)
    .order("priority", { ascending: false })
    .order("symbol", { ascending: true });

  if (error) throw new Error(`讀取 watchlist 失敗：${error.message}`);

  return (data ?? []) as WatchlistRow[];
}

async function getPriceRows(symbol: string): Promise<PriceRow[]> {
  const { data, error } = await supabase
    .from("daily_prices")
    .select("trade_date,close,volume")
    .eq("symbol", symbol)
    .order("trade_date", { ascending: false })
    .limit(30);

  if (error) throw new Error(`${symbol} 讀取 daily_prices 失敗：${error.message}`);

  return ((data ?? []) as PriceRow[]).reverse();
}

async function getForeignRows(symbol: string): Promise<ForeignRow[]> {
  const { data, error } = await supabase
    .from("foreign_trading")
    .select("trade_date,foreign_buy")
    .eq("symbol", symbol)
    .order("trade_date", { ascending: false })
    .limit(30);

  if (error) throw new Error(`${symbol} 讀取 foreign_trading 失敗：${error.message}`);

  return ((data ?? []) as ForeignRow[]).reverse();
}

async function getLatestClose(symbol: string) {
  const { data } = await supabase
    .from("daily_prices")
    .select("close,trade_date")
    .eq("symbol", symbol)
    .order("trade_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    close: data?.close ? Number(data.close) : null,
    tradeDate: data?.trade_date ?? null,
  };
}

async function analyzeOne(row: WatchlistRow) {
  const symbol = row.symbol;

  const prices = await getPriceRows(symbol);
  const foreignRows = await getForeignRows(symbol);
  const latest = await getLatestClose(symbol);

  if (prices.length < 5) {
    throw new Error(`${symbol} 價格資料不足，目前只有 ${prices.length} 筆`);
  }

  if (foreignRows.length < 5) {
    throw new Error(`${symbol} 外資資料不足，目前只有 ${foreignRows.length} 筆`);
  }

  const result = calculateAccumulationScore({
    prices,
    foreignRows,
  });

  const payload = {
    user_name: "Bruce",
    symbol,
    stock_name: row.name ?? symbol,
    close: latest.close,
    foreign_buy_5: result.foreignBuy5,
    foreign_buy_10: result.foreignBuy10,
    foreign_buy_20: result.foreignBuy20,
    foreign_days: result.foreignDays,
    price_change_5: null,
    price_change_10: result.priceChange10,
    absorption_efficiency: result.absorptionEfficiency,
    accumulation_score: result.accumulationScore,
    signal: result.signal,
    reason: result.reason,
    created_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("foreign_accumulation_scores")
    .upsert(payload, {
      onConflict: "user_name,symbol",
    });

  if (error) {
    throw new Error(`${symbol} 寫入 foreign_accumulation_scores 失敗：${error.message}`);
  }

  return {
    symbol,
    name: row.name,
    success: true,
    close: latest.close,
    tradeDate: latest.tradeDate,
    priceRows: prices.length,
    foreignRows: foreignRows.length,
    ...result,
  };
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: "Accumulation Engine API is ready. Use POST to analyze watchlist.",
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const singleSymbol = body.symbol ? String(body.symbol).trim() : "";

    let targets = await getWatchlistTargets();

    if (singleSymbol) {
      targets = targets.filter((x) => x.symbol === singleSymbol);
    }

    const results = [];

    for (const target of targets) {
      try {
        results.push(await analyzeOne(target));
      } catch (error) {
        results.push({
          symbol: target.symbol,
          name: target.name,
          success: false,
          error: String(error),
        });
      }
    }

    const successCount = results.filter((x: any) => x.success).length;
    const failedCount = results.length - successCount;

    return NextResponse.json(
      {
        success: successCount > 0,
        analysisDate: todayString(),
        total: results.length,
        successCount,
        failedCount,
        results,
      },
      { status: successCount > 0 ? 200 : 500 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: String(error),
      },
      { status: 500 }
    );
  }
}