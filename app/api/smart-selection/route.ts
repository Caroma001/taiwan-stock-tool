import { NextRequest,NextResponse } from "next/server";
import { readSmartSelection } from "@/lib/smart-selection/service";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(req:NextRequest){try{return NextResponse.json({ok:true,...await readSmartSelection(Number(req.nextUrl.searchParams.get("limit")??30))});}catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:String(error),summary:{total:0,withOwnership:0,foreignLatent:0,latestDate:null},rows:[]},{status:500});}}
