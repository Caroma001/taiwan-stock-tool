import { NextResponse } from "next/server";
import { getRuntimeSafetyConfig } from "@/lib/runtime/mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const config = getRuntimeSafetyConfig();
  return NextResponse.json({
    ok: true,
    version: "M8.6",
    ...config,
    storage: "Turso",
    updateEngine: config.developmentMode ? "local-manual-resumable" : "production-controlled",
  });
}
