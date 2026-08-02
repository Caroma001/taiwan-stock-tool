import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db, USER_NAME, nowIso, today, asNumber, rowObject } from "@/lib/portfolio/turso";

export async function POST(req: NextRequest) {
  try {
    const b=await req.json(); const symbol=String(b.symbol??"").trim();
    const buyPrice=asNumber(b.buyPrice); const quantity=asNumber(b.quantityLots);
    if(!symbol||buyPrice<=0||quantity<=0) throw new Error("股票代號、買進價與張數必須正確");
    const stock=await db().execute({sql:"SELECT symbol FROM stocks WHERE symbol=? LIMIT 1",args:[symbol]});
    if(!stock.rows.length) throw new Error(`股票代號 ${symbol} 不存在於 Turso 股票主檔`);
    const id=randomUUID(), now=nowIso();
    await db().execute({sql:`INSERT INTO portfolio_lots(id,user_name,symbol,buy_date,buy_price,quantity_lots,remaining_lots,target_sell_price,fees,tax,note,holding_type,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,args:[id,USER_NAME,symbol,b.buyDate||today(),buyPrice,quantity,quantity,b.targetSellPrice?asNumber(b.targetSellPrice):null,asNumber(b.fees),asNumber(b.tax),b.note||null,b.holdingType==="test"?"test":"real","open",now,now]});
    return NextResponse.json({ok:true,item:{id,symbol}});
  } catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:400});}
}
export async function DELETE(req: NextRequest){
  try{const b=await req.json();const id=String(b.id??"");if(!id)throw new Error("缺少持倉批次 ID");
    const lot=await db().execute({sql:"SELECT * FROM portfolio_lots WHERE id=? AND user_name=?",args:[id,USER_NAME]});
    if(!lot.rows.length)throw new Error("找不到持倉批次"); const item=rowObject(lot.rows[0]);
    if(item.status!=="open")throw new Error("已結案持股不可刪除");
    const trades=await db().execute({sql:"SELECT COUNT(*) AS count FROM trade_history WHERE lot_id=?",args:[id]});
    if(asNumber(rowObject(trades.rows[0]).count)>0)throw new Error("此批持股已有賣出紀錄，不能直接刪除");
    await db().execute({sql:"DELETE FROM portfolio_lots WHERE id=? AND user_name=?",args:[id,USER_NAME]});
    return NextResponse.json({ok:true,deletedId:id,symbol:item.symbol,holdingType:item.holding_type});
  }catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:400});}
}
