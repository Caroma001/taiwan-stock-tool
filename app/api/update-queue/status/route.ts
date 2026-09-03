import { NextRequest, NextResponse } from "next/server";
import { getQueueStatus } from "@/lib/data-center";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(request: NextRequest){try{return NextResponse.json({ok:true,status:await getQueueStatus(request.nextUrl.searchParams.get("symbol")??undefined)});}catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:500});}}
