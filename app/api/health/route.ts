import { NextResponse } from "next/server";
import pkg from "@/package.json";
import { getTursoClient } from "@/lib/turso/client";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(){
  const checkedAt=new Date().toISOString(); const started=Date.now();
  try{
    const client=getTursoClient();
    const [db,job,run,market]=await Promise.all([
      client.execute("select sqlite_version() as version"),
      client.execute("SELECT status,job_date,processed_symbols,total_symbols,updated_at,completed_at,last_error FROM cloud_update_jobs ORDER BY updated_at DESC LIMIT 1"),
      client.execute("SELECT status,trigger_source,started_at,heartbeat_at,completed_at,elapsed_ms,batches_processed,symbols_processed,last_error FROM cloud_scheduler_runs ORDER BY started_at DESC LIMIT 1"),
      client.execute("SELECT regime_date,market_score,regime,updated_at FROM market_regime_daily ORDER BY regime_date DESC LIMIT 1"),
    ]);
    const latencyMs=Date.now()-started;
    const payload={ok:true,service:"twstock",version:pkg.version,environment:process.env.VERCEL_ENV??process.env.NODE_ENV??"unknown",database:{ok:true,provider:"turso",latencyMs,sqliteVersion:db.rows[0]?.version??null},cloudJob:job.rows[0]??null,scheduler:run.rows[0]??null,market:market.rows[0]??null,commit:process.env.VERCEL_GIT_COMMIT_SHA?.slice(0,8)??null,time:checkedAt};
    try{await client.execute({sql:"INSERT INTO cloud_health_checks(checked_at,service,status,latency_ms,details_json) VALUES(?,?,?,?,?)",args:[checkedAt,"twstock","healthy",latencyMs,JSON.stringify({version:pkg.version,job:job.rows[0]?.status??null})]});}catch{}
    return NextResponse.json(payload);
  }catch(error){return NextResponse.json({ok:false,service:"twstock",version:pkg.version,error:error instanceof Error?error.message:String(error),time:checkedAt},{status:503});}
}
