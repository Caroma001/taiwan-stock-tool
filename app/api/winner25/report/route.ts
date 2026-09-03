import { NextResponse } from "next/server";
import { readWinner25Report } from "@/lib/winner25/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    return NextResponse.json(await readWinner25Report(url.searchParams.get("runId") ?? undefined));
  } catch (error) {
    return NextResponse.json({ ok:false, error:error instanceof Error ? error.message : String(error) }, { status:500 });
  }
}
