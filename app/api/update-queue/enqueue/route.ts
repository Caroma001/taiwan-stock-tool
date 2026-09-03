import { NextRequest, NextResponse } from "next/server";
import { enqueueStockUpdate } from "@/lib/data-center";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function POST(request: NextRequest) {
  try { const body=await request.json(); return NextResponse.json({ok:true,row:await enqueueStockUpdate({symbol:String(body.symbol??""),purpose:body.purpose??"manual",priority:Number(body.priority??100)})}); }
  catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:400});}
}
