import { NextRequest, NextResponse } from "next/server";
import { db, USER_NAME, rowObject, asNumber } from "@/lib/portfolio/turso";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const raw = req.nextUrl.searchParams.get("type");
    const filter = raw === "test" || raw === "all" ? raw : "real";
    const args: Array<string> = [USER_NAME];
    let typeSql = "";
    if (filter !== "all") { typeSql = " AND pl.holding_type = ?"; args.push(filter); }
    const result = await db().execute({
      sql: `SELECT pl.*, s.name AS stock_name, s.market,
        (SELECT dp.close FROM daily_prices dp WHERE dp.symbol=pl.symbol ORDER BY dp.trade_date DESC LIMIT 1) AS current_price,
        (SELECT dp.trade_date FROM daily_prices dp WHERE dp.symbol=pl.symbol ORDER BY dp.trade_date DESC LIMIT 1) AS trade_date,
        d.target_1 AS ai_target_price, d.stop_loss AS ai_stop_loss_price,
        d.recommendation AS ai_action, d.confidence AS ai_confidence,
        a.total_score AS ai_score, d.trade_date AS ai_plan_date
      FROM portfolio_lots pl
      LEFT JOIN stocks s ON s.symbol=pl.symbol
      LEFT JOIN decision_latest d ON d.symbol=pl.symbol
      LEFT JOIN ai_analysis_latest a ON a.symbol=pl.symbol
      WHERE pl.user_name=? AND pl.status='open' AND pl.remaining_lots>0${typeSql}
      ORDER BY pl.symbol, pl.buy_date`,
      args,
    });
    const lots = result.rows.map(rowObject);
    const grouped = new Map<string, Record<string, unknown>[]>();
    for (const lot of lots) grouped.set(String(lot.symbol), [...(grouped.get(String(lot.symbol)) ?? []), lot]);
    const rows = [...grouped.entries()].map(([symbol, symbolLots]) => {
      const totalLots = symbolLots.reduce((s,l)=>s+asNumber(l.remaining_lots),0);
      const totalCost = symbolLots.reduce((s,l)=>s+asNumber(l.buy_price)*asNumber(l.remaining_lots)*1000+asNumber(l.fees)+asNumber(l.tax),0);
      const averageCost = totalLots ? totalCost/(totalLots*1000):0;
      const currentPrice = symbolLots[0].current_price == null ? null : asNumber(symbolLots[0].current_price);
      const marketValue = currentPrice == null ? null : currentPrice*totalLots*1000;
      const unrealizedProfit = marketValue == null ? null : marketValue-totalCost;
      return {
        symbol, stock_name:symbolLots[0].stock_name ?? "", market:symbolLots[0].market ?? "",
        holding_type:symbolLots[0].holding_type, total_lots:totalLots, total_cost:totalCost,
        average_cost:averageCost, current_price:currentPrice, trade_date:symbolLots[0].trade_date,
        market_value:marketValue, unrealized_profit:unrealizedProfit,
        unrealized_return_pct:unrealizedProfit==null||!totalCost?null:unrealizedProfit/totalCost*100,
        ai_target_price:symbolLots[0].ai_target_price, ai_stop_loss_price:symbolLots[0].ai_stop_loss_price,
        ai_action:symbolLots[0].ai_action, ai_confidence:symbolLots[0].ai_confidence,
        ai_score:symbolLots[0].ai_score, ai_plan_date:symbolLots[0].ai_plan_date,
        lots:symbolLots,
      };
    });
    const totalCost = rows.reduce((s,r)=>s+asNumber(r.total_cost),0);
    const marketValue = rows.reduce((s,r)=>s+asNumber(r.market_value),0);
    const unrealizedProfit = marketValue-totalCost;
    return NextResponse.json({ok:true,filter,rows,summary:{totalCost,marketValue,unrealizedProfit,unrealizedReturnPct:totalCost?unrealizedProfit/totalCost*100:0}});
  } catch (error) { return NextResponse.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:500}); }
}
