import { NextRequest, NextResponse } from "next/server";
import { getTursoClient } from "@/lib/turso/client";

export const dynamic = "force-dynamic";
const n=(v:unknown)=>Number(v??0);
export async function GET(req:NextRequest){
 try{
  const q=(req.nextUrl.searchParams.get("q")??"").trim();
  const limit=Math.min(200,Math.max(1,Number(req.nextUrl.searchParams.get("limit")??100)));
  const client=getTursoClient();
  const where=q?"WHERE i.symbol LIKE ? OR s.name LIKE ?":"";
  const args=q?[`%${q}%`,`%${q}%`,limit]:[limit];
  const [rows,summary]=await Promise.all([
   client.execute({sql:`SELECT i.*,s.name AS stock_name,s.market FROM indicator_latest i JOIN stocks s ON s.symbol=i.symbol ${where} ORDER BY i.trade_date DESC,i.symbol LIMIT ?`,args}),
   client.execute(`SELECT COUNT(*) total,MAX(trade_date) latest_trade_date,AVG(rsi14) avg_rsi FROM indicator_latest`)
  ]);
  return NextResponse.json({ok:true,summary:{total:n(summary.rows[0]?.total),latestTradeDate:String(summary.rows[0]?.latest_trade_date??""),averageRsi:n(summary.rows[0]?.avg_rsi)},rows:rows.rows});
 }catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:String(e)},{status:500});}
}
