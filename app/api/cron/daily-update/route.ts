export const maxDuration = 60;

import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import {
  fetchFinMindStockInfo,
  fetchFinMindStockPrice,
} from "@/app/lib/finmind";

type StockTarget = {
  symbol: string;
  name?: string | null;
  market?: string | null;
};

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getStartDate(daysBack = 14) {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return toDateString(d);
}

function normalizeMarket(value: unknown) {
  const text = String(value || "").toLowerCase();

  if (text.includes("twse") || text.includes("上市") || text.includes("sii")) {
    return "TWSE";
  }

  if (text.includes("tpex") || text.includes("上櫃") || text.includes("otc")) {
    return "TPEX";
  }

  if (text.includes("興櫃")) {
    return "EMERGING";
  }

  return "UNKNOWN";
}

async function getTargets() {
  const map = new Map<string, StockTarget>();

  const { data: positions } = await supabase
    .from("user_positions")
    .select("symbol, note")
    .eq("user_name", "Bruce");

  for (const p of positions ?? []) {
    if (!p.symbol) continue;

    map.set(String(p.symbol), {
      symbol: String(p.symbol),
      name: p.note ?? null,
    });
  }

  const { data: watchlist } = await supabase
    .from("watchlist")
    .select("symbol, name, market")
    .eq("user_name", "Bruce")
    .eq("is_active", true);

  for (const w of watchlist ?? []) {
    if (!w.symbol) continue;

    map.set(String(w.symbol), {
      symbol: String(w.symbol),
      name: w.name ?? null,
      market: w.market ?? null,
    });
  }

  return Array.from(map.values()).sort((a, b) =>
    a.symbol.localeCompare(b.symbol)
  );
}

async function updateOneStock(target: StockTarget) {
  const symbol = target.symbol;

  const info = await fetchFinMindStockInfo(symbol);
  const prices = await fetchFinMindStockPrice(symbol, getStartDate(14));

  if (!prices.length) {
    return {
      symbol,
      success: false,
      error: "找不到近期股價資料",
    };
  }

  const latest = prices[prices.length - 1];

  const name =
    info?.stock_name ||
    info?.name ||
    target.name ||
    symbol;

  const market =
    normalizeMarket(info?.type || info?.market || info?.exchange) ||
    target.market ||
    "UNKNOWN";

  await supabase.from("stocks").upsert({
    symbol,
    name,
    market,
    industry: info?.industry_category || "",
    is_active: true,
  });

  let inserted = 0;

  for (const p of prices) {
    if (!p.date || p.close === undefined || p.close === null) continue;

    const { error } = await supabase.from("daily_prices").upsert(
      {
        symbol,
        trade_date: p.date,
        open: Number(p.open) || null,
        high: Number(p.max) || null,
        low: Number(p.min) || null,
        close: Number(p.close),
        volume: Number(p.Trading_Volume) || null,
      },
      {
        onConflict: "symbol,trade_date",
      }
    );

    if (!error) inserted++;
  }

  return {
    symbol,
    name,
    market,
    success: true,
    latestDate: latest.date,
    close: Number(latest.close),
    inserted,
  };
}

async function runAiScore(origin: string) {
  const res = await fetch(`${origin}/api/ai-score`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  const text = await res.text();

  try {
    return JSON.parse(text);
  } catch {
    return {
      success: false,
      error: text,
    };
  }
}

export async function GET(req: Request) {
  return runDailyUpdate(req);
}

export async function POST(req: Request) {
  return runDailyUpdate(req);
}

async function runDailyUpdate(req: Request) {
  const startedAt = new Date().toISOString();

  try {
    const origin = new URL(req.url).origin;

    const targets = await getTargets();

    const results = [];

    for (const target of targets) {
      try {
        const result = await updateOneStock(target);
        results.push(result);
      } catch (error) {
        results.push({
          symbol: target.symbol,
          success: false,
          error: String(error),
        });
      }
    }

    const aiResult = await runAiScore(origin);

    return NextResponse.json({
      success: true,
      message: "Daily update completed",
      startedAt,
      finishedAt: new Date().toISOString(),
      totalTargets: targets.length,
      updated: results.filter((r: any) => r.success).length,
      failed: results.filter((r: any) => !r.success).length,
      results,
      aiResult,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: "Daily update failed",
        error: String(error),
      },
      { status: 500 }
    );
  }
}