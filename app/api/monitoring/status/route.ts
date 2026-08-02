import { NextResponse } from "next/server";
import { getTursoClient } from "@/lib/turso/client";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(){
  const db=getTursoClient();
  const incidents=await db.execute("SELECT id,status,severity,title,message,opened_at,updated_at,resolved_at,notification_sent,rollback_requested FROM production_incidents ORDER BY updated_at DESC LIMIT 20");
  return NextResponse.json({ok:true,version:"7.7.0",incidents:incidents.rows});
}
