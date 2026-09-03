import { NextResponse } from "next/server";
import { PROJECT_RELEASE } from "@/lib/version/project-version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return NextResponse.json({
    ok: true,
    release: PROJECT_RELEASE,
    service: "twstock",
    time: new Date().toISOString(),
  });
}
