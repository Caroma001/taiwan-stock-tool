import { NextRequest, NextResponse } from "next/server";
import { getTursoClient } from "@/lib/turso/client";
export const dynamic="force-dynamic";
const n=(v:unknown)=>Number(v??0);
export async function GET(req:NextRequest){
 try{
  const q=(req.nextUrl.searchParams.get("q")??"").trim();
  const rec=(req.nextUrl.searchParams.get("recommendation")??"all").trim();
  const clauses:string[]=[];const args:any[]=[];
  if(q){clauses.push("(d.symbol LIKE ? OR s.name LIKE ?)");args.push(`%${q}%`,`%${q}%`)}
  if(rec!=="all"){clauses.push("d.recommendation=?");args.push(rec)}
  const where=clauses.length?`WHERE ${clauses.join(" AND ")}`:"";args.push(200);
  const client=getTursoClient();
  const [rows,summary]=await Promise.all([
   client.execute({sql:`SELECT d.*,s.name stock_name,s.market,i.close,COALESCE(a.final_score,a.total_score) total_score,a.trend_score,a.momentum_score,a.volume_score,a.risk_score FROM decision_latest d JOIN stocks s ON s.symbol=d.symbol LEFT JOIN indicator_latest i ON i.symbol=d.symbol LEFT JOIN ai_analysis_latest a ON a.symbol=d.symbol ${where} ORDER BY COALESCE(a.final_score,a.total_score) DESC,d.confidence DESC LIMIT ?`,args}),
   client.execute(`SELECT COUNT(*) total,AVG(confidence) avg_confidence,SUM(CASE WHEN recommendation IN ('強勢觀察','買進觀察') THEN 1 ELSE 0 END) candidates,MAX(trade_date) latest_trade_date FROM decision_latest`)
  ]);
  return NextResponse.json({ok:true,summary:{total:n(summary.rows[0]?.total),averageConfidence:n(summary.rows[0]?.avg_confidence),candidates:n(summary.rows[0]?.candidates),latestTradeDate:String(summary.rows[0]?.latest_trade_date??"")},rows:rows.rows});
 }catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:String(e)},{status:500});}
}
