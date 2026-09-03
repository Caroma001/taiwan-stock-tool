import { NextResponse } from "next/server";
import { TursoDatabaseAdapter } from "@/adapters/turso";
import { getTursoClient } from "@/lib/turso";
import type { DatabaseRow } from "@/lib/database";
import { resolveEffectiveTradingDate } from "@/lib/development/trading-date";

export const dynamic="force-dynamic";
export const revalidate=0;

export async function GET(){
  try{
    const trading=await resolveEffectiveTradingDate();
    if(trading.marketClosedToday || trading.beforeSafeClose){
      return NextResponse.json({ok:true,shouldRemind:false,calendarDate:trading.calendarDate,effectiveTradingDate:trading.effectiveTradingDate,reason:trading.reason});
    }
    const db=new TursoDatabaseAdapter(getTursoClient());
    const review=await db.execute<DatabaseRow>({sql:"SELECT * FROM swing10_daily_review WHERE trade_date=? LIMIT 1",args:[trading.calendarDate]}).catch(()=>({rows:[],rowsAffected:0} as any));
    const row=review.rows[0];
    if(!row){
      return NextResponse.json({ok:true,shouldRemind:true,kind:"update_pending",tradeDate:trading.calendarDate,message:"今日已過 15:00 安全收盤時間；請先執行『每日一鍵更新』，再檢查 A級 Swing10 候選。"});
    }
    const reviewed=Boolean(Number(row.reviewed??0));
    const aGradeCount=Number(row.a_grade_count??0),riskChangedCount=Number(row.risk_changed_count??0);
    const exitResult=await db.execute<DatabaseRow>({
      sql:"SELECT COUNT(*) AS count FROM swing10_exit_alert_daily WHERE trade_date=? AND action='sell_check'",
      args:[trading.calendarDate],
    }).catch(()=>({rows:[],rowsAffected:0} as any));
    const sellCheckCount=Number(exitResult.rows[0]?.count??0);
    const message=sellCheckCount>0
      ? `今日 A級 ${aGradeCount} 檔；另有 ${sellCheckCount} 個 Swing10 部位出現『賣出檢查』，請優先確認。`
      : aGradeCount>0
        ? `今日 A級 Swing10 ${aGradeCount} 檔；風險明顯變化 ${riskChangedCount} 檔，請完成收盤檢查。`
        : `今日沒有 A級 Swing10；風險變化 ${riskChangedCount} 檔，建議確認持股與是否維持觀望。`;
    return NextResponse.json({
      ok:true,shouldRemind:!reviewed,kind:"review",tradeDate:trading.calendarDate,reviewed,
      aGradeCount,riskChangedCount,sellCheckCount,message,
    });
  }catch(error){
    return NextResponse.json({ok:false,shouldRemind:false,error:error instanceof Error?error.message:String(error)});
  }
}
