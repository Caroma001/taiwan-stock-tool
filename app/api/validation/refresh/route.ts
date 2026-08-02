import { NextResponse } from "next/server"; import { refreshValidationSnapshots } from "@/lib/market/service";
export const runtime="nodejs"; export async function POST(){try{return NextResponse.json({ok:true,...await refreshValidationSnapshots()});}catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:String(e)},{status:500});}}
