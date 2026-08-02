import { NextResponse } from "next/server"; import { readValidationCenter } from "@/lib/market/service";
export const runtime="nodejs"; export const dynamic="force-dynamic"; export async function GET(){try{return NextResponse.json({ok:true,...await readValidationCenter()});}catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:String(e)},{status:500});}}
