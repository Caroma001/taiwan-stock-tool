import { NextResponse } from "next/server";
import { refreshEarlyWatchWithMigration } from "@/lib/early-watch/service";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=120;
export async function POST(request:Request){
  try{
    let tradeDate: string | undefined;
    try{const body=await request.json();tradeDate=typeof body?.tradeDate==="string"?body.tradeDate:undefined;}catch{}
    return NextResponse.json(await refreshEarlyWatchWithMigration(tradeDate));
  }catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:500});}
}
