import { NextRequest, NextResponse } from "next/server";
import { processQueuedSymbol, processUpdateQueue } from "@/lib/data-center";
export const runtime="nodejs"; export const dynamic="force-dynamic"; export const maxDuration=300;
export async function POST(request: NextRequest){
  try { const body=await request.json().catch(()=>({})); const symbol=String(body.symbol??"").trim(); const result=symbol?await processQueuedSymbol(symbol,body.purpose):await processUpdateQueue(Number(body.limit??1)); return NextResponse.json({ok:true,result}); }
  catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:500});}
}
