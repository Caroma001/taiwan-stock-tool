import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db, USER_NAME, today, nowIso, rowObject } from "@/lib/portfolio/turso";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 try{const b=await req.json().catch(()=>({}));const raw=String(b.holdingType??"test");const args:[string,...string[]]=[USER_NAME];let typeSql="";if(raw!=="all"){typeSql=" AND pl.holding_type=?";args.push(raw==="real"?"real":"test");}
 const lots=await db().execute({sql:`SELECT pl.id,pl.symbol,d.recommendation,d.target_1,d.target_2,d.stop_loss,d.confidence,d.reason,a.total_score FROM portfolio_lots pl LEFT JOIN decision_latest d ON d.symbol=pl.symbol LEFT JOIN ai_analysis_latest a ON a.symbol=pl.symbol WHERE pl.user_name=? AND pl.status='open'${typeSql}`,args});let completed=0,failed=0;const now=nowIso();for(const rawRow of lots.rows){const row=rowObject(rawRow);try{if(!row.recommendation)throw new Error("尚無決策資料");await db().execute({sql:`INSERT INTO ai_decisions(id,user_name,lot_id,symbol,decision_date,recommendation,target_1,target_2,stop_loss,confidence,total_score,reason,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(lot_id,decision_date) DO UPDATE SET recommendation=excluded.recommendation,target_1=excluded.target_1,target_2=excluded.target_2,stop_loss=excluded.stop_loss,confidence=excluded.confidence,total_score=excluded.total_score,reason=excluded.reason,created_at=excluded.created_at`,args:[randomUUID(),USER_NAME,row.id,row.symbol,today(),row.recommendation,row.target_1,row.target_2,row.stop_loss,row.confidence,row.total_score,row.reason,now]});completed++;}catch{failed++;}}
 return NextResponse.json({ok:true,completed,failed});
 }catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:500});}
}
