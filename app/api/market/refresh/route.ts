import { NextResponse } from "next/server"; import { refreshMarketData } from "@/lib/market/service";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function POST(){try{return NextResponse.json({ok:true,...await refreshMarketData()});}catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:String(e)},{status:500});}}
