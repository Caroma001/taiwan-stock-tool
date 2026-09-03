import { NextRequest, NextResponse } from "next/server";
import { refreshSwing10ExitAlertsWithMigration } from "@/lib/swing10/trade-execution";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
  try{const body=await req.json().catch(()=>({}));return NextResponse.json(await refreshSwing10ExitAlertsWithMigration(body?.tradeDate?String(body.tradeDate):undefined));}
  catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:500});}
}
