import { NextRequest, NextResponse } from "next/server";
import { markSwing10Reviewed } from "@/lib/swing10/service";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
  try{
    const body=await req.json().catch(()=>({}));
    const tradeDate=String(body?.tradeDate??"");
    if(!/^\d{4}-\d{2}-\d{2}$/.test(tradeDate)) return NextResponse.json({ok:false,error:"缺少有效 tradeDate"},{status:400});
    return NextResponse.json(await markSwing10Reviewed(tradeDate,String(body?.note??"")));
  }catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:500});}
}
