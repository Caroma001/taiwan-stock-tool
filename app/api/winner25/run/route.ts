import { NextResponse } from "next/server";
import { finalizeWinner25Run, runWinner25Step, startWinner25Run } from "@/lib/winner25/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action ?? "start");
    if (action === "start") return NextResponse.json(await startWinner25Run());
    if (action === "step") {
      const runId = String(body?.runId ?? "");
      if (!runId) return NextResponse.json({ ok:false, error:"缺少 runId" }, { status:400 });
      return NextResponse.json(await runWinner25Step(runId, Number(body?.batchSize ?? 20)));
    }
    if (action === "finalize") {
      const runId = String(body?.runId ?? "");
      if (!runId) return NextResponse.json({ ok:false, error:"缺少 runId" }, { status:400 });
      return NextResponse.json(await finalizeWinner25Run(runId));
    }
    return NextResponse.json({ ok:false, error:`未知 action: ${action}` }, { status:400 });
  } catch (error) {
    return NextResponse.json({ ok:false, error:error instanceof Error ? error.message : String(error) }, { status:500 });
  }
}
