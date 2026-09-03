import { NextRequest, NextResponse } from "next/server";
import { markDailyReportDownloaded, readDailyIntegratedReport, refreshDailyIntegratedReport } from "@/lib/daily-report/service";
export const runtime="nodejs"; export const dynamic="force-dynamic"; export const revalidate=0;

export async function GET(req:NextRequest){
  try { const date=req.nextUrl.searchParams.get("date"); return NextResponse.json(await readDailyIntegratedReport(date),{headers:{"Cache-Control":"no-store"}}); }
  catch(error){ return NextResponse.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:500}); }
}

export async function POST(req:NextRequest){
  try { const body=await req.json().catch(()=>({})); const report=await refreshDailyIntegratedReport(body?.date?String(body.date):null); return NextResponse.json({ok:true,report},{headers:{"Cache-Control":"no-store"}}); }
  catch(error){ return NextResponse.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:500}); }
}

export async function PATCH(req:NextRequest){
  try {
    const body=await req.json().catch(()=>({}));
    const date=String(body?.date??""); const format=String(body?.format??"") as "json"|"txt";
    if(format!=="json"&&format!=="txt") throw new Error("format 必須是 json 或 txt");
    const exportStatus=await markDailyReportDownloaded(date,format,body?.filename?String(body.filename):null,body?.signature?String(body.signature):null);
    return NextResponse.json({ok:true,exportStatus},{headers:{"Cache-Control":"no-store"}});
  } catch(error){ return NextResponse.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:400}); }
}
