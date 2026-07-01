import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";

type DailyPrice = {
  symbol: string;
  trade_date: string;
  close: number | null;
};

function calcMA(rows: DailyPrice[], days: number) {
  const list = rows.filter((x) => x.close !== null).slice(0, days);
  if (list.length < days) return null;

  return list.reduce((sum, x) => sum + Number(x.close), 0) / days;
}

function calcTrend(
  close: number | null,
  ma5: number | null,
  ma20: number | null,
  ma60: number | null
) {
  if (!close || !ma5 || !ma20) return "資料不足";

  if (ma60 && close > ma5 && ma5 > ma20 && ma20 > ma60) {
    return "多頭排列";
  }

  if (close > ma5 && ma5 > ma20) return "強勢";
  if (close > ma20) return "偏多";
  if (close < ma20) return "偏弱";

  return "整理";
}

function calcRadarScore(
  close: number | null,
  ma5: number | null,
  ma20: number | null,
  ma60: number | null
) {
  if (!close || !ma5 || !ma20) return 0;

  let score = 50;

  if (close > ma5) score += 15;
  if (ma5 > ma20) score += 20;
  if (close > ma20) score += 15;
  if (close < ma20) score -= 20;

  if (ma60) {
    if (ma20 > ma60) score += 10;
    if (close < ma60) score -= 10;
  }

  return Math.max(0, Math.min(100, score));
}

export async function GET() {
  const { data, error } = await supabase
    .from("watchlist")
    .select("*")
    .eq("user_name", "Bruce")
    .eq("is_active", true)
    .order("priority", { ascending: false })
    .order("symbol", { ascending: true });

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }

  const symbols = (data ?? []).map((x) => x.symbol);

  let prices: DailyPrice[] = [];

  if (symbols.length > 0) {
    const { data: priceData, error: priceError } = await supabase
      .from("daily_prices")
      .select("symbol,trade_date,close")
      .in("symbol", symbols)
      .order("trade_date", { ascending: false });

    if (priceError) {
      return NextResponse.json(
        { success: false, error: priceError.message },
        { status: 500 }
      );
    }

    prices = (priceData ?? []) as DailyPrice[];
  }

  const result = (data ?? []).map((row) => {
    const history = prices.filter((x) => x.symbol === row.symbol);

    const close = history[0]?.close ?? null;
    const ma5 = calcMA(history, 5);
    const ma20 = calcMA(history, 20);
    const ma60 = calcMA(history, 60);

    const trend = calcTrend(close, ma5, ma20, ma60);
    const radarScore = calcRadarScore(close, ma5, ma20, ma60);

    return {
      ...row,
      close,
      ma5,
      ma20,
      ma60,
      trend,
      radarScore,
      historyCount: history.length,
    };
  });

  result.sort((a, b) => {
    const scoreA = Number(a.radarScore ?? 0);
    const scoreB = Number(b.radarScore ?? 0);

    if (scoreB !== scoreA) return scoreB - scoreA;

    return Number(b.priority ?? 0) - Number(a.priority ?? 0);
  });

  return NextResponse.json({
    success: true,
    data: result,
  });
}

export async function POST(req: Request) {
  const body = await req.json();

  const symbol = String(body.symbol || "").trim();
  const name = String(body.name || "").trim();
  const market = String(body.market || "UNKNOWN").trim();
  const sector = String(body.sector || "").trim();
  const groupName = String(body.groupName || "").trim();
  const reason = String(body.reason || "使用者自選股").trim();

  const priority = Number.isFinite(Number(body.priority))
    ? Math.max(1, Math.min(5, Number(body.priority)))
    : 3;

  if (!symbol) {
    return NextResponse.json(
      { success: false, error: "請輸入股票代號" },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("watchlist").upsert(
    {
      user_name: "Bruce",
      symbol,
      name: name || symbol,
      market,
      sector,
      group_name: groupName || sector || "自選觀察",
      reason,
      priority,
      take_profit_percent: 20,
      notify: true,
      enabled: true,
      is_active: true,
    },
    {
      onConflict: "user_name,symbol",
    }
  );

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    message: `${symbol} 已加入觀察池`,
  });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = String(searchParams.get("symbol") || "").trim();

  if (!symbol) {
    return NextResponse.json(
      { success: false, error: "缺少股票代號" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("watchlist")
    .update({
      is_active: false,
      enabled: false,
    })
    .eq("user_name", "Bruce")
    .eq("symbol", symbol);

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    message: `${symbol} 已停用觀察`,
  });
}