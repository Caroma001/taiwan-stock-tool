import { NextRequest,NextResponse } from "next/server";
import { TursoDatabaseAdapter } from "@/adapters/turso";
import { getTursoClient } from "@/lib/turso";
import { MigrationRunner } from "@/migrations/database/MigrationRunner";
import { tursoMigrations } from "@/migrations/turso";
import { resolveEffectiveTradingDate } from "@/lib/development/trading-date";
import { readBruceSwingScores,refreshBruceSwingScores } from "@/lib/m8121/bruce-swing-score";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(request:NextRequest){
  try{
    const db=new TursoDatabaseAdapter(getTursoClient());
    await new MigrationRunner(db,tursoMigrations).migrate();
    const trading=await resolveEffectiveTradingDate();
    const requested=request.nextUrl.searchParams.get("date");
    const tradeDate=requested&&/^\d{4}-\d{2}-\d{2}$/.test(requested)?requested:trading.effectiveTradingDate;
    const limit=Math.max(1,Math.min(40,Number(request.nextUrl.searchParams.get("limit")??20)));
    let rows=await readBruceSwingScores(db,tradeDate,limit);
    if(!rows.length){await refreshBruceSwingScores(db,tradeDate);rows=await readBruceSwingScores(db,tradeDate,limit);}
    return NextResponse.json({ok:true,version:"M8.12.3",tradeDate,rows});
  }catch(error){
    return NextResponse.json({ok:false,version:"M8.12.3",error:error instanceof Error?error.message:String(error),rows:[]},{status:500});
  }
}
