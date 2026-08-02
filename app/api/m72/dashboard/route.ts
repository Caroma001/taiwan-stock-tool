import { NextResponse } from "next/server";
import { readM72Dashboard } from "@/lib/turso/dashboard";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return NextResponse.json(await readM72Dashboard()); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
}
