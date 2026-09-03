import { NextResponse } from "next/server";
import { removeCatalystEvent, upsertCatalystEvent } from "@/lib/early-watch/service";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:Request){
  try{return NextResponse.json(await upsertCatalystEvent(await request.json()));}
  catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:400});}
}
export async function DELETE(request:Request){
  try{const body=await request.json();return NextResponse.json(await removeCatalystEvent(String(body?.id??"")));}
  catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:400});}
}
