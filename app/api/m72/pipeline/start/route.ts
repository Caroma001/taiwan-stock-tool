import { NextResponse } from "next/server";
export const runtime = "nodejs";
export async function POST() {
  return NextResponse.json({
    ok: false,
    error: "M7.2 網頁目前只負責監控 Turso。全市場 Pipeline 請在 Terminal 執行 npm run pipeline:run；後續部署 Vercel Cron 時再改為雲端背景工作。",
  }, { status: 409 });
}
