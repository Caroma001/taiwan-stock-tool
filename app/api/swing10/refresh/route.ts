import { NextResponse } from "next/server";
import { refreshSwing10DailySnapshotWithMigration } from "@/lib/swing10/service";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=120;
export async function POST(){
  try{return NextResponse.json(await refreshSwing10DailySnapshotWithMigration());}
  catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:500});}
}
