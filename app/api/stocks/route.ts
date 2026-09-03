import { NextResponse } from "next/server";
import { getTursoClient } from "@/lib/turso/client";
import { enqueueStockUpdate } from "@/lib/data-center";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(req:Request){
 try{const symbol=String(new URL(req.url).searchParams.get("symbol")??"").trim();if(!symbol)return NextResponse.json({error:"請提供股票代號"},{status:400});
 const db=getTursoClient(); const r=await db.execute({sql:`SELECT s.symbol,s.name,s.market,s.industry,p.trade_date,p.open,p.high,p.low,p.close,p.volume
 FROM stocks s LEFT JOIN daily_prices p ON p.symbol=s.symbol
 WHERE s.symbol=? ORDER BY p.trade_date DESC LIMIT 1`,args:[symbol]}); const row:any=r.rows[0];if(!row)return NextResponse.json({error:"找不到股票",source:"Turso"},{status:404});
 if(row.close==null) await enqueueStockUpdate({symbol,purpose:"manual",priority:10});
 return NextResponse.json({symbol:String(row.symbol),name:String(row.name??symbol),market:String(row.market??""),industry:String(row.industry??""),trade_date:row.trade_date??null,date:row.trade_date??null,open:row.open??null,high:row.high??null,low:row.low??null,max:row.high??null,min:row.low??null,close:row.close??null,volume:row.volume??null,source:"Turso",pending:row.close==null});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:String(error),source:"Turso"},{status:500});}}
