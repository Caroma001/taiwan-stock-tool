import { NextResponse } from "next/server"; import { readLatestMarket } from "@/lib/market/service";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(){try{return NextResponse.json({ok:true,...await readLatestMarket()});}catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:String(e)},{status:500});}}
