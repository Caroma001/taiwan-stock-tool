import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";

export async function GET() {
  try {
    const { data: positions, error: positionError } = await supabase
      .from("user_positions")
      .select("*")
      .eq("user_name", "Bruce");

    if (positionError) throw positionError;

    let totalCost = 0;
    let totalValue = 0;

    for (const p of positions ?? []) {
      const buyPrice = Number(p.buy_price ?? 0);
      const shares = Number(p.shares ?? 0);

      totalCost += buyPrice * shares * 1000;

      const { data: latest } = await supabase
        .from("daily_prices")
        .select("close")
        .eq("symbol", p.symbol)
        .order("trade_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latest?.close) {
        totalValue += Number(latest.close) * shares * 1000;
      }
    }

    const totalProfit = totalValue - totalCost;
    const totalReturn =
      totalCost > 0 ? Number(((totalProfit / totalCost) * 100).toFixed(2)) : 0;

    const { data: scores, error: scoreError } = await supabase
      .from("foreign_accumulation_scores")
      .select("*")
      .eq("user_name", "Bruce")
      .order("accumulation_score", { ascending: false });

    if (scoreError) throw scoreError;

    const allScores = (scores ?? []).map((x) => ({
      symbol: x.symbol,
      name: x.stock_name ?? x.symbol,
      close: x.close ?? null,
      score: Number(x.accumulation_score ?? 0),
      signal: x.signal ?? "-",
      foreignBuy20: Number(x.foreign_buy_20 ?? 0),
      foreignDays: Number(x.foreign_days ?? 0),
      priceChange10:
        x.price_change_10 === null || x.price_change_10 === undefined
          ? null
          : Number(x.price_change_10),
      efficiency: Number(x.absorption_efficiency ?? 0),
      summary: x.reason ?? "-",
    }));

    const { count: watchCount, error: watchError } = await supabase
      .from("watchlist")
      .select("*", { count: "exact", head: true })
      .eq("user_name", "Bruce")
      .eq("is_active", true)
      .eq("enabled", true);

    if (watchError) throw watchError;

    const { data: latestPrice } = await supabase
      .from("daily_prices")
      .select("trade_date")
      .order("trade_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      updatedAt: latestPrice?.trade_date ?? null,

      portfolio: {
        totalCost: Math.round(totalCost),
        totalValue: Math.round(totalValue),
        totalProfit: Math.round(totalProfit),
        totalReturn,
      },

      ai: {
        buy: allScores.filter((x) => x.score >= 85).length,
        hold: allScores.filter((x) => x.score >= 55 && x.score < 85).length,
        sell: allScores.filter((x) => x.score < 55).length,
        topPicks: allScores.slice(0, 10),
        allScores,
      },

      watchlist: {
        total: watchCount ?? 0,
      },

      system: {
        database: "OK",
        aiEngine: "AIS",
        cloud: "Vercel",
      },
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