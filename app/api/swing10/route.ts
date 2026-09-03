import { NextResponse } from "next/server";
import { readSwing10Dashboard } from "@/lib/swing10/service";
export const dynamic="force-dynamic";
export const revalidate=0;
export async function GET(){
  try{return NextResponse.json(await readSwing10Dashboard(),{headers:{"Cache-Control":"no-store"}});}
  catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:500});}
}
