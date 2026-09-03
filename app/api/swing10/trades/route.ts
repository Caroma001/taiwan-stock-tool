import { NextRequest, NextResponse } from "next/server";
import { createSwing10Trade, readSwing10TradeDashboard } from "@/lib/swing10/trade-execution";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const revalidate=0;

export async function GET(){
  try{return NextResponse.json(await readSwing10TradeDashboard(),{headers:{"Cache-Control":"no-store"}});}
  catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:500});}
}

export async function POST(req:NextRequest){
  try{
    const body=await req.json();
    return NextResponse.json(await createSwing10Trade({
      symbol:String(body.symbol??""),
      holdingType:body.holdingType==="test"?"test":"real",
      buyPrice:body.buyPrice==null?null:Number(body.buyPrice),
      quantityLots:body.quantityLots==null?null:Number(body.quantityLots),
      buyDate:body.buyDate==null?null:String(body.buyDate),
      note:body.note==null?null:String(body.note),
      takeProfitPct:body.takeProfitPct==null?null:Number(body.takeProfitPct),
      stopLossPct:body.stopLossPct==null?null:Number(body.stopLossPct),
      maxHoldingDays:body.maxHoldingDays==null?null:Number(body.maxHoldingDays),
    }));
  }catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:400});}
}
