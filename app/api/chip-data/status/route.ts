import { NextResponse } from "next/server";import { readChipSyncStatus } from "@/lib/chip-data";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(){try{return NextResponse.json({ok:true,runs:await readChipSyncStatus()});}catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:500});}}
