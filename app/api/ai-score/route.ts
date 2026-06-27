import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";

export async function GET() {
  return NextResponse.json({
    message: "AI Score API is ready",
  });
}

export async function POST() {
  const { data: prices, error } = await supabase
    .from("daily_prices")
    .select("*")
    .order("trade_date", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    count: prices?.length ?? 0,
    message: "AI Score API 測試成功",
  });
}