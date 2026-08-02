import { NextResponse } from "next/server";
import { refreshM72Top30 } from "@/lib/turso/dashboard";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST() {
  try { return NextResponse.json({ ok: true, ...(await refreshM72Top30()) }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
}
