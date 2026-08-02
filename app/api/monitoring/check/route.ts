import { NextResponse } from "next/server";
import { getTursoClient } from "@/lib/turso/client";
import { safeEqual } from "@/lib/cloud/security";
import { sendProductionNotification } from "@/lib/monitoring/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const expected = process.env.MONITORING_SECRET || process.env.CLOUD_ADMIN_SECRET;
  if (!expected) return false;
  const auth = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return safeEqual(auth, expected);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const db = getTursoClient();
  const now = new Date().toISOString();
  const incidentKey = "production-health";
  try {
    const started = Date.now();
    await db.execute("SELECT 1 AS ok");
    const latestJob = await db.execute("SELECT status,updated_at,last_error FROM cloud_update_jobs ORDER BY updated_at DESC LIMIT 1");
    const latencyMs = Date.now() - started;
    const staleCutoff = Date.now() - 36 * 60 * 60 * 1000;
    const row = latestJob.rows[0];
    const stale = Boolean(row?.updated_at && new Date(String(row.updated_at)).getTime() < staleCutoff);
    const unhealthy = row?.status === "error" || stale;
    if (unhealthy) throw new Error(stale ? "Cloud update job is stale for more than 36 hours" : String(row?.last_error ?? "Cloud update job failed"));

    const open = await db.execute({ sql: "SELECT id FROM production_incidents WHERE incident_key=? AND status='open' LIMIT 1", args: [incidentKey] });
    if (open.rows[0]) {
      await db.execute({ sql: "UPDATE production_incidents SET status='resolved',resolved_at=?,updated_at=? WHERE id=?", args: [now, now, open.rows[0].id] });
      await sendProductionNotification({ level: "recovery", title: "twstock production recovered", message: "Production health checks are healthy again.", details: { latencyMs } }).catch(() => undefined);
    }
    return NextResponse.json({ ok: true, version: "7.7.0", latencyMs, checkedAt: now, cloudJob: row ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const existing = await db.execute({ sql: "SELECT id FROM production_incidents WHERE incident_key=? AND status='open' LIMIT 1", args: [incidentKey] }).catch(() => ({ rows: [] as any[] }));
    let id = existing.rows[0]?.id as string | undefined;
    if (!id) {
      id = crypto.randomUUID();
      await db.execute({ sql: "INSERT INTO production_incidents(id,incident_key,status,severity,title,message,deployment_url,commit_sha,opened_at,updated_at,details_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)", args: [id,incidentKey,"open","critical","Production health check failed",message,process.env.VERCEL_URL ?? null,process.env.VERCEL_GIT_COMMIT_SHA ?? null,now,now,JSON.stringify({ source: "api-monitoring-check" })] }).catch(() => undefined);
      const result = await sendProductionNotification({ level: "critical", title: "twstock production failure", message, details: { deployment: process.env.VERCEL_URL, commit: process.env.VERCEL_GIT_COMMIT_SHA } }).catch(() => ({ sent: false }));
      if (result.sent) await db.execute({ sql: "UPDATE production_incidents SET notification_sent=1 WHERE id=?", args: [id] }).catch(() => undefined);
    } else {
      await db.execute({ sql: "UPDATE production_incidents SET message=?,updated_at=? WHERE id=?", args: [message, now, id] }).catch(() => undefined);
    }
    return NextResponse.json({ ok: false, version: "7.7.0", error: message, incidentId: id, rollbackRecommended: true, checkedAt: now }, { status: 503 });
  }
}
