import { NextRequest,NextResponse } from "next/server";
import { recoverM8121DailyReport } from "@/lib/m8121/report-recovery";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=300;

export async function POST(request:NextRequest){
  try{
    const body=await request.json().catch(()=>({}));
    const result=await recoverM8121DailyReport(body?.date??null);
    return NextResponse.json(result,{status:result.ok?200:409});
  }catch(error){
    return NextResponse.json({ok:false,version:"M8.12.3",error:error instanceof Error?error.message:String(error)},{status:500});
  }
}
