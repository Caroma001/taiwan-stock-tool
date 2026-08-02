import { NextResponse } from "next/server";
import { getTursoClient } from "@/lib/turso/client";
export const dynamic="force-dynamic";
const n=(v:unknown)=>Number(v??0);
export async function GET(){
 try{
  const c=getTursoClient();
  const [run,runs,tasks,prices]=await Promise.all([
   c.execute(`SELECT * FROM market_pipeline_runs ORDER BY started_at DESC LIMIT 1`),
   c.execute(`SELECT * FROM market_pipeline_runs ORDER BY started_at DESC LIMIT 20`),
   c.execute(`SELECT status,COUNT(*) total FROM market_pipeline_tasks WHERE run_id=(SELECT id FROM market_pipeline_runs ORDER BY started_at DESC LIMIT 1) GROUP BY status`),
   c.execute(`SELECT COUNT(DISTINCT symbol) symbols,COUNT(*) rows,MAX(trade_date) latest_trade_date FROM daily_prices`)
  ]);
  const r=run.rows[0]??{};const total=n(r.total_symbols),processed=n(r.processed_symbols);
  return NextResponse.json({ok:true,current:{...r,percentage:total?processed/total*100:0},taskCounts:tasks.rows,priceSummary:{symbols:n(prices.rows[0]?.symbols),rows:n(prices.rows[0]?.rows),latestTradeDate:String(prices.rows[0]?.latest_trade_date??"")},runs:runs.rows});
 }catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:String(e)},{status:500});}
}
