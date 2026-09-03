import { NextResponse } from "next/server";
import { readEarlyWatchDashboard } from "@/lib/early-watch/service";
export const dynamic="force-dynamic";
export const revalidate=0;
export async function GET(){
  try{return NextResponse.json(await readEarlyWatchDashboard(),{headers:{"Cache-Control":"no-store"}});}
  catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:500});}
}
