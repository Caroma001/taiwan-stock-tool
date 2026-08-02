import { NextResponse } from "next/server";
import { createOrResumeCloudJob } from "@/lib/cloud/jobs";
import { isAuthorizedAdmin } from "@/lib/cloud/security";
export const runtime="nodejs"; export const dynamic="force-dynamic"; export const maxDuration=60;
export async function POST(request:Request){if(!isAuthorizedAdmin(request))return NextResponse.json({ok:false,error:"Unauthorized"},{status:401});try{return NextResponse.json({ok:true,job:await createOrResumeCloudJob(12)});}catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:String(e)},{status:500});}}
