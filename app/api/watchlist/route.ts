import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";

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

  return NextResponse.json({
    success: true,
    data: data ?? [],
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