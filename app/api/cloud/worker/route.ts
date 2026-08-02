import { NextResponse } from "next/server";
import { processCloudBatch, runCloudSchedulerWindow } from "@/lib/cloud/jobs";
import { isAuthorizedAdmin, isAuthorizedCron } from "@/lib/cloud/security";
export const runtime="nodejs"; export const dynamic="force-dynamic"; export const maxDuration=300;
export async function POST(request:Request){
  if(!isAuthorizedAdmin(request)&&!isAuthorizedCron(request))return NextResponse.json({ok:false,error:"Unauthorized"},{status:401});
  try{
    const body=await request.json().catch(()=>({}));
    if(body?.singleBatch) return NextResponse.json(await processCloudBatch(body.jobId));
    return NextResponse.json(await runCloudSchedulerWindow({source:String(body?.source??"cloud-worker"),maxDurationMs:Number(body?.maxDurationMs??265000),batchSize:Number(body?.batchSize??12)}));
  }catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:String(e)},{status:500});}
}
export async function GET(request:Request){
  if(!isAuthorizedCron(request))return NextResponse.json({ok:false,error:"Unauthorized"},{status:401});
  try{return NextResponse.json(await runCloudSchedulerWindow({source:"worker-get",maxDurationMs:265000,batchSize:12}));}
  catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:String(e)},{status:500});}
}
