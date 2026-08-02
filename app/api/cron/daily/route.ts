import { NextResponse } from "next/server";
import { runCloudSchedulerWindow } from "@/lib/cloud/jobs";
import { isAuthorizedCron } from "@/lib/cloud/security";
export const runtime="nodejs"; export const dynamic="force-dynamic"; export const maxDuration=300;
export async function GET(request:Request){
  if(!isAuthorizedCron(request)) return NextResponse.json({ok:false,error:"Unauthorized"},{status:401});
  try{return NextResponse.json(await runCloudSchedulerWindow({source:"vercel-cron",maxDurationMs:265000,batchSize:12}));}
  catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:String(e)},{status:500});}
}
