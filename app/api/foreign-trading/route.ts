import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";

type WatchRow = {
  symbol: string;
  name: string | null;
};

type FinMindRow = {
  date?: string;
  stock_id?: string;
  name?: string;
  buy?: number;
  sell?: number;
  buy_sell?: number;
};

function getStartDate(daysBack = 45) {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

function isForeignName(name: string) {
  const text = name.toLowerCase();
  return (
    text.includes("foreign") ||
    text.includes("外資") ||
    text.includes("foreign_investor") ||
    text.includes("foreign dealer")
  );
}

function getNetBuy(row: FinMindRow) {
  if (row.buy_sell !== undefined && row.buy_sell !== null) {
    return Math.round(Number(row.buy_sell));
  }

  const buy = Number(row.buy ?? 0);
  const sell = Number(row.sell ?? 0);

  return Math.round(buy - sell);
}

async function fetchForeignTrading(symbol: string) {
  const params = new URLSearchParams({
    dataset: "TaiwanStockInstitutionalInvestorsBuySell",
    data_id: symbol,
    start_date: getStartDate(45),
  });

  const token = process.env.FINMIND_API_TOKEN;
  if (token) params.set("token", token);

  const url = `https://api.finmindtrade.com/api/v4/data?${params.toString()}`;

  const res = await fetch(url, {
    cache: "no-store",
  });

  const json = await res.json();

  if (!res.ok || json.status !== 200) {
    throw new Error(json.msg || `FinMind request failed: ${res.status}`);
  }

  const rows = (json.data ?? []) as FinMindRow[];

  const dailyMap = new Map<string, number>();

  for (const row of rows) {
    if (!row.date) continue;

    const name = String(row.name || "");

    if (!isForeignName(name)) continue;

    const current = dailyMap.get(row.date) ?? 0;
    dailyMap.set(row.date, current + getNetBuy(row));
  }

  return Array.from(dailyMap.entries())
    .map(([trade_date, foreign_buy]) => ({
      symbol,
      trade_date,
      foreign_buy,
    }))
    .sort((a, b) => a.trade_date.localeCompare(b.trade_date))
    .slice(-20);
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

  if (singleSymbol) {
    query = query.eq("symbol", singleSymbol);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`讀取 watchlist 失敗：${error.message}`);
  }

  return (data ?? []) as WatchRow[];
}

async function updateOne(symbol: string) {
  const rows = await fetchForeignTrading(symbol);

  if (!rows.length) {
    return {
      symbol,
      success: false,
      inserted: 0,
      error: "找不到外資資料",
    };
  }

  const { error } = await supabase.from("foreign_trading").upsert(rows, {
    onConflict: "symbol,trade_date",
  });

  if (error) {
    throw new Error(`${symbol} 寫入 foreign_trading 失敗：${error.message}`);
  }

  return {
    symbol,
    success: true,
    inserted: rows.length,
    latestDate: rows.at(-1)?.trade_date ?? null,
    foreignBuy20: rows.reduce((sum, r) => sum + Number(r.foreign_buy || 0), 0),
  };
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message:
      "Foreign Trading API is ready. Use POST to update Watchlist foreign trading data.",
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
        const result = await updateOne(target.symbol);
        results.push(result);
      } catch (error) {
        results.push({
          symbol: target.symbol,
          success: false,
          error: String(error),
        });
      }
    }

    return NextResponse.json({
      success: true,
      total: results.length,
      successCount: results.filter((r: any) => r.success).length,
      failedCount: results.filter((r: any) => !r.success).length,
      results,
    });
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