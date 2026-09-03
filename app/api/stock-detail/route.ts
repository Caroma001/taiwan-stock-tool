import { NextRequest, NextResponse } from "next/server";
import { getTursoClient } from "@/lib/turso/client";
import { enqueueStockUpdate } from "@/lib/data-center";
import { readForeignAccumulation } from "@/lib/foreign-accumulation";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(request: NextRequest){
 try{
  const symbol=String(request.nextUrl.searchParams.get("symbol")??"").trim(); if(!/^\d{4,6}$/.test(symbol)) throw new Error("請輸入 4～6 碼股票代號");
  const db=getTursoClient();
  const [main,history,queue]=await Promise.all([
   db.execute({sql:`SELECT s.name,s.market,s.industry,i.trade_date,i.close,i.ma5,i.ma20,i.ma60,i.ma240,i.rsi14,i.k,i.d,i.macd,i.macd_signal,
    a.total_score,a.final_score,a.confidence,a.reasons_json,d.recommendation,d.target_1,d.target_2,d.stop_loss,d.expected_return,d.risk_reward,d.reason
    FROM stocks s LEFT JOIN indicator_latest i ON i.symbol=s.symbol LEFT JOIN ai_analysis_latest a ON a.symbol=s.symbol LEFT JOIN decision_latest d ON d.symbol=s.symbol WHERE s.symbol=? LIMIT 1`,args:[symbol]}),
   db.execute({sql:"SELECT trade_date,open,high,low,close,volume FROM daily_prices WHERE symbol=? ORDER BY trade_date DESC LIMIT 240",args:[symbol]}),
   db.execute({sql:"SELECT status,next_attempt_at,last_error_message,updated_at FROM update_queue WHERE symbol=? ORDER BY requested_at DESC LIMIT 1",args:[symbol]}),
  ]);
  const row:any=main.rows[0]; if(!row) return NextResponse.json({ok:false,error:"找不到股票"},{status:404});
  const h=[...history.rows].reverse() as any[]; const latest=h.at(-1)??null, prev=h.at(-2)??null; const change=latest&&prev?Number(latest.close)-Number(prev.close):null; const changePct=change!=null&&Number(prev?.close)?change/Number(prev.close)*100:null;
  let reasons:string[]=[]; try{const x=JSON.parse(String(row.reasons_json??"[]"));if(Array.isArray(x))reasons=x.map(String)}catch{}
  if(!latest) await enqueueStockUpdate({symbol,purpose:"manual",priority:10});
  const foreignMap = await readForeignAccumulation([symbol]);
  const foreign = foreignMap.get(symbol) ?? null;
  return NextResponse.json({ok:true,symbol,name:String(row.name??symbol),market:String(row.market??""),industry:String(row.industry??""),source:"Turso",
   quote:latest?{tradeDate:latest.trade_date,open:Number(latest.open),high:Number(latest.high),low:Number(latest.low),close:Number(latest.close),volume:Number(latest.volume),change,changePct,source:"Turso 最新已儲存資料"}:null,
   indicators:{tradeDate:row.trade_date??null,close:row.close??null,ma5:row.ma5??null,ma20:row.ma20??null,ma60:row.ma60??null,ma240:row.ma240??null,rsi14:row.rsi14??null,k:row.k??null,d:row.d??null,macd:row.macd??null,macdSignal:row.macd_signal??null},
   analysis:{score:row.final_score??row.total_score??null,confidence:row.confidence??null,recommendation:row.recommendation??null,target1:row.target_1??null,target2:row.target_2??null,stopLoss:row.stop_loss??null,expectedReturn:row.expected_return??null,riskReward:row.risk_reward??null,reason:row.reason??null,reasons},
   foreign,
   queue:queue.rows[0]??null,history:h.map((x,index,all)=>{const avg=(days:number)=>index+1>=days?all.slice(index-days+1,index+1).reduce((sum,y)=>sum+Number(y.close),0)/days:null;return {date:x.trade_date,open:Number(x.open),high:Number(x.high),low:Number(x.low),close:Number(x.close),volume:Number(x.volume),ma20:avg(20),ma60:avg(60)};}),
   dataCoverage:{priceDays:h.length,foreignDays:foreign?.dataDays??0,ownershipAvailable:false}});
 }catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:500});}
}
