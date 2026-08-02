import { NextRequest, NextResponse } from "next/server";
import { getTursoClient } from "@/lib/turso/client";
export const dynamic="force-dynamic";
const n=(v:unknown)=>Number(v??0);
export async function GET(req:NextRequest){
 try{
  const q=(req.nextUrl.searchParams.get("q")??"").trim();
  const min=Math.max(0,Number(req.nextUrl.searchParams.get("min")??0));
  const client=getTursoClient();
  const args:any[]=[min]; let search="";
  if(q){search="AND (a.symbol LIKE ? OR s.name LIKE ?)";args.push(`%${q}%`,`%${q}%`)}
  args.push(200);
  const [rows,summary]=await Promise.all([
   client.execute({sql:`SELECT a.*,s.name stock_name,s.market,i.close FROM ai_analysis_latest a JOIN stocks s ON s.symbol=a.symbol LEFT JOIN indicator_latest i ON i.symbol=a.symbol WHERE COALESCE(a.final_score,a.total_score)>=? ${search} ORDER BY COALESCE(a.final_score,a.total_score) DESC LIMIT ?`,args}),
   client.execute(`SELECT COUNT(*) total,AVG(COALESCE(final_score,total_score)) avg_score,MAX(trade_date) latest_trade_date FROM ai_analysis_latest`)
  ]);
  return NextResponse.json({ok:true,summary:{total:n(summary.rows[0]?.total),averageScore:n(summary.rows[0]?.avg_score),latestTradeDate:String(summary.rows[0]?.latest_trade_date??"")},rows:rows.rows});
 }catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:String(e)},{status:500});}
}
