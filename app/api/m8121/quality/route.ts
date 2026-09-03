import { NextRequest,NextResponse } from "next/server";
import { TursoDatabaseAdapter } from "@/adapters/turso";
import { getTursoClient } from "@/lib/turso";
import { MigrationRunner } from "@/migrations/database/MigrationRunner";
import { tursoMigrations } from "@/migrations/turso";
import { resolveEffectiveTradingDate } from "@/lib/development/trading-date";
import { refreshM8121DataQuality } from "@/lib/m8121/quality-service";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const revalidate=0;

export async function GET(request:NextRequest){
  try{
    const db=new TursoDatabaseAdapter(getTursoClient());
    await new MigrationRunner(db,tursoMigrations).migrate();
    const trading=await resolveEffectiveTradingDate();
    const requested=request.nextUrl.searchParams.get("date");
    const tradeDate=requested&&/^\d{4}-\d{2}-\d{2}$/.test(requested)?requested:trading.effectiveTradingDate;
    const quality=await refreshM8121DataQuality(db,tradeDate);
    return NextResponse.json({ok:true,version:"M8.12.3",trading,quality},{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    return NextResponse.json({ok:false,version:"M8.12.3",error:error instanceof Error?error.message:String(error)},{status:500});
  }
}
