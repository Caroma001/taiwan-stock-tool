import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db, USER_NAME, nowIso, today, asNumber, rowObject } from "@/lib/portfolio/turso";
export async function POST(req:NextRequest){
 try{const b=await req.json();const lotId=String(b.lotId??"");const sellPrice=asNumber(b.sellPrice);const qty=asNumber(b.quantityLots);if(!lotId||sellPrice<=0||qty<=0)throw new Error("賣出資料不完整");
 const result=await db().execute({sql:`SELECT pl.*,s.name AS stock_name FROM portfolio_lots pl LEFT JOIN stocks s ON s.symbol=pl.symbol WHERE pl.id=? AND pl.user_name=?`,args:[lotId,USER_NAME]});if(!result.rows.length)throw new Error("找不到持倉批次");const lot=rowObject(result.rows[0]);const remaining=asNumber(lot.remaining_lots);if(qty>remaining)throw new Error("賣出張數不可大於剩餘張數");
 const shares=qty*1000,grossCost=asNumber(lot.buy_price)*shares,grossProceeds=sellPrice*shares,buyFees=asNumber(lot.fees)*(qty/asNumber(lot.quantity_lots)),sellFees=asNumber(b.sellFees),tax=asNumber(b.transactionTax),profit=grossProceeds-grossCost-buyFees-sellFees-tax,returnPct=grossCost?profit/grossCost*100:0,newRemaining=remaining-qty,now=nowIso();
 const tx=await db().transaction("write");try{await tx.execute({sql:`INSERT INTO trade_history(id,user_name,lot_id,symbol,stock_name,buy_date,sell_date,buy_price,sell_price,quantity_lots,gross_cost,gross_proceeds,buy_fees,sell_fees,transaction_tax,realized_profit,realized_return_pct,holding_type,note,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,args:[randomUUID(),USER_NAME,lotId,lot.symbol,lot.stock_name??"",lot.buy_date,b.sellDate||today(),lot.buy_price,sellPrice,qty,grossCost,grossProceeds,buyFees,sellFees,tax,profit,returnPct,lot.holding_type,b.note||null,now]});await tx.execute({sql:"UPDATE portfolio_lots SET remaining_lots=?,status=?,updated_at=? WHERE id=?",args:[newRemaining,newRemaining<=0?"closed":"open",now,lotId]});await tx.commit();}catch(e){await tx.rollback();throw e;}
 return NextResponse.json({ok:true,realizedProfit:profit,realizedReturnPct:returnPct});
 }catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:400});}
}
