import { NextRequest, NextResponse } from "next/server";
import { db, USER_NAME, rowObject, asNumber } from "@/lib/portfolio/turso";

export const dynamic = "force-dynamic";

type Filter = "all" | "real" | "test" | "watch";

function normalizeFilter(raw: string | null): Filter {
  return raw === "real" || raw === "test" || raw === "watch" ? raw : "all";
}

export async function GET(req: NextRequest) {
  try {
    const filter = normalizeFilter(req.nextUrl.searchParams.get("type"));
    const lotResult = await db().execute({
          sql: `SELECT pl.*, s.name AS stock_name, s.market,
            i.close AS current_price,
            i.trade_date AS trade_date,
            CASE WHEN (SELECT 1 FROM daily_prices dp WHERE dp.symbol=pl.symbol AND dp.trade_date>=pl.buy_date ORDER BY dp.trade_date LIMIT 1 OFFSET 19) IS NOT NULL
              THEN 20
              ELSE (SELECT COUNT(*) FROM daily_prices dp WHERE dp.symbol=pl.symbol AND dp.trade_date>=pl.buy_date)
            END AS observation_days,
            (SELECT dp.close FROM daily_prices dp WHERE dp.symbol=pl.symbol AND dp.trade_date>=pl.buy_date ORDER BY dp.trade_date ASC LIMIT 1 OFFSET 9) AS close_10d,
            (SELECT dp.close FROM daily_prices dp WHERE dp.symbol=pl.symbol AND dp.trade_date>=pl.buy_date ORDER BY dp.trade_date ASC LIMIT 1 OFFSET 19) AS close_20d,
            d.target_1 AS ai_target_price, d.stop_loss AS ai_stop_loss_price,
            d.recommendation AS ai_action, d.confidence AS ai_confidence,
            a.total_score AS ai_score, d.trade_date AS ai_plan_date
          FROM portfolio_lots pl
          LEFT JOIN stocks s ON s.symbol=pl.symbol
          LEFT JOIN indicator_latest i ON i.symbol=pl.symbol
          LEFT JOIN decision_latest d ON d.symbol=pl.symbol
          LEFT JOIN ai_analysis_latest a ON a.symbol=pl.symbol
          WHERE pl.user_name=? AND pl.status='open' AND pl.remaining_lots>0
          ORDER BY pl.holding_type, pl.symbol, pl.buy_date`,
          args: [USER_NAME],
        });

    const lots = Array.from(lotResult.rows as any[]).map(rowObject);
    const grouped = new Map<string, Record<string, unknown>[]>();

    for (const lot of lots) {
      const key = `${String(lot.holding_type)}:${String(lot.symbol)}`;
      grouped.set(key, [...(grouped.get(key) ?? []), lot]);
    }

    const holdingRows = [...grouped.values()].map((symbolLots) => {
      const symbol = String(symbolLots[0].symbol);
      const totalLots = symbolLots.reduce((sum, lot) => sum + asNumber(lot.remaining_lots), 0);
      const totalCost = symbolLots.reduce(
        (sum, lot) => sum + asNumber(lot.buy_price) * asNumber(lot.remaining_lots) * 1000 + asNumber(lot.fees) + asNumber(lot.tax),
        0,
      );
      const averageCost = totalLots ? totalCost / (totalLots * 1000) : 0;
      const currentPrice = symbolLots[0].current_price == null ? null : asNumber(symbolLots[0].current_price);
      const marketValue = currentPrice == null ? null : currentPrice * totalLots * 1000;
      const unrealizedProfit = marketValue == null ? null : marketValue - totalCost;
      const close10 = symbolLots[0].close_10d == null ? null : asNumber(symbolLots[0].close_10d);
      const close20 = symbolLots[0].close_20d == null ? null : asNumber(symbolLots[0].close_20d);
      const return10Pct = averageCost > 0 && close10 != null ? ((close10 / averageCost) - 1) * 100 : null;
      const return20Pct = averageCost > 0 && close20 != null ? ((close20 / averageCost) - 1) * 100 : null;

      return {
        symbol,
        stock_name: symbolLots[0].stock_name ?? "",
        market: symbolLots[0].market ?? "",
        holding_type: String(symbolLots[0].holding_type),
        total_lots: totalLots,
        total_cost: totalCost,
        average_cost: averageCost,
        current_price: currentPrice,
        trade_date: symbolLots[0].trade_date,
        observation_days: asNumber(symbolLots[0].observation_days),
        return_10d_pct: return10Pct,
        return_20d_pct: return20Pct,
        market_value: marketValue,
        unrealized_profit: unrealizedProfit,
        unrealized_return_pct: unrealizedProfit == null || !totalCost ? null : (unrealizedProfit / totalCost) * 100,
        ai_target_price: symbolLots[0].ai_target_price,
        ai_stop_loss_price: symbolLots[0].ai_stop_loss_price,
        ai_action: symbolLots[0].ai_action,
        ai_confidence: symbolLots[0].ai_confidence,
        ai_score: symbolLots[0].ai_score,
        ai_plan_date: symbolLots[0].ai_plan_date,
        strategy_tag: symbolLots[0].strategy_tag ?? null,
        strategy_batch_id: symbolLots[0].strategy_batch_id ?? null,
        selection_rank: symbolLots[0].selection_rank == null ? null : asNumber(symbolLots[0].selection_rank),
        entry_potential_score: symbolLots[0].entry_potential_score == null ? null : asNumber(symbolLots[0].entry_potential_score),
        entry_breakout_score: symbolLots[0].entry_breakout_score == null ? null : asNumber(symbolLots[0].entry_breakout_score),
        entry_stealth_score: symbolLots[0].entry_stealth_score == null ? null : asNumber(symbolLots[0].entry_stealth_score),
        entry_stage: symbolLots[0].entry_stage ?? null,
        source: "portfolio",
        status: "active",
        reason: null,
        lots: symbolLots,
      };
    });

    const heldSymbols = new Set(holdingRows.map((row) => row.symbol));
    let watchRows: Array<Record<string, unknown>> = [];

    {
      // M8.11.8 Unified Watchlist Source of Truth:
      // portfolio overview reads both the canonical watchlist and the legacy hot-stock pool
      // in ONE query, then deduplicates by symbol with watchlist taking priority.
      const watchResult = await db().execute({
        sql: `SELECT * FROM (
          SELECT w.symbol, s.name AS stock_name, s.market,
            w.note AS reason, 'waiting' AS status, w.created_at AS added_at,
            NULL AS position_type,
            (SELECT dp.close FROM daily_prices dp
              WHERE dp.symbol=w.symbol AND dp.trade_date>=substr(w.created_at,1,10)
              ORDER BY dp.trade_date ASC LIMIT 1) AS average_cost,
            NULL AS quantity, substr(w.created_at,1,10) AS purchase_date,
            i.close AS current_price, i.trade_date,
            CASE WHEN (SELECT 1 FROM daily_prices dp
              WHERE dp.symbol=w.symbol AND dp.trade_date>=substr(w.created_at,1,10)
              ORDER BY dp.trade_date LIMIT 1 OFFSET 19) IS NOT NULL
              THEN 20
              ELSE (SELECT COUNT(*) FROM daily_prices dp
                WHERE dp.symbol=w.symbol AND dp.trade_date>=substr(w.created_at,1,10))
            END AS observation_days,
            (SELECT dp.close FROM daily_prices dp
              WHERE dp.symbol=w.symbol AND dp.trade_date>=substr(w.created_at,1,10)
              ORDER BY dp.trade_date ASC LIMIT 1 OFFSET 9) AS close_10d,
            (SELECT dp.close FROM daily_prices dp
              WHERE dp.symbol=w.symbol AND dp.trade_date>=substr(w.created_at,1,10)
              ORDER BY dp.trade_date ASC LIMIT 1 OFFSET 19) AS close_20d,
            d.target_1 AS ai_target_price, d.stop_loss AS ai_stop_loss_price,
            d.recommendation AS ai_action, d.confidence AS ai_confidence,
            a.total_score AS ai_score, d.trade_date AS ai_plan_date,
            'watchlist' AS source,
            CASE
              WHEN w.note LIKE '%Early Watch EW-A%' THEN 'Early Watch EW-A'
              WHEN w.note LIKE '%Early Watch EW-B%' THEN 'Early Watch EW-B'
              WHEN w.note LIKE '%Early Watch WATCH%' THEN 'Early Watch WATCH'
              WHEN w.note LIKE '%Early Watch%' THEN 'Early Watch'
              ELSE '手動觀察'
            END AS watch_source,
            0 AS source_priority
          FROM watchlist w
          LEFT JOIN stocks s ON s.symbol=w.symbol
          LEFT JOIN indicator_latest i ON i.symbol=w.symbol
          LEFT JOIN decision_latest d ON d.symbol=w.symbol
          LEFT JOIN ai_analysis_latest a ON a.symbol=w.symbol
          WHERE w.user_name=?

          UNION ALL

          SELECT h.symbol, s.name AS stock_name, s.market,
            h.reason, h.status, h.added_at,
            h.position_type,
            COALESCE(h.average_cost,
              (SELECT dp.close FROM daily_prices dp
                WHERE dp.symbol=h.symbol
                  AND dp.trade_date>=COALESCE(h.purchase_date,substr(h.added_at,1,10))
                ORDER BY dp.trade_date ASC LIMIT 1)) AS average_cost,
            h.quantity, COALESCE(h.purchase_date,substr(h.added_at,1,10)) AS purchase_date,
            i.close AS current_price, i.trade_date,
            CASE WHEN (SELECT 1 FROM daily_prices dp
              WHERE dp.symbol=h.symbol
                AND dp.trade_date>=COALESCE(h.purchase_date,substr(h.added_at,1,10))
              ORDER BY dp.trade_date LIMIT 1 OFFSET 19) IS NOT NULL
              THEN 20
              ELSE (SELECT COUNT(*) FROM daily_prices dp
                WHERE dp.symbol=h.symbol
                  AND dp.trade_date>=COALESCE(h.purchase_date,substr(h.added_at,1,10)))
            END AS observation_days,
            (SELECT dp.close FROM daily_prices dp
              WHERE dp.symbol=h.symbol
                AND dp.trade_date>=COALESCE(h.purchase_date,substr(h.added_at,1,10))
              ORDER BY dp.trade_date ASC LIMIT 1 OFFSET 9) AS close_10d,
            (SELECT dp.close FROM daily_prices dp
              WHERE dp.symbol=h.symbol
                AND dp.trade_date>=COALESCE(h.purchase_date,substr(h.added_at,1,10))
              ORDER BY dp.trade_date ASC LIMIT 1 OFFSET 19) AS close_20d,
            d.target_1 AS ai_target_price, d.stop_loss AS ai_stop_loss_price,
            d.recommendation AS ai_action, d.confidence AS ai_confidence,
            a.total_score AS ai_score, d.trade_date AS ai_plan_date,
            'hot-stock' AS source,
            CASE
              WHEN lower(COALESCE(h.source,'')) LIKE '%early%' THEN 'Early Watch'
              WHEN COALESCE(h.source,'')<>'' THEN h.source
              ELSE '舊觀察池'
            END AS watch_source,
            1 AS source_priority
          FROM hot_stock_candidates h
          LEFT JOIN stocks s ON s.symbol=h.symbol
          LEFT JOIN indicator_latest i ON i.symbol=h.symbol
          LEFT JOIN decision_latest d ON d.symbol=h.symbol
          LEFT JOIN ai_analysis_latest a ON a.symbol=h.symbol
          WHERE h.is_active=1 AND COALESCE(h.position_type,'watch')='watch'
        ) unified_watch
        ORDER BY source_priority ASC, added_at ASC`,
        args: [USER_NAME],
      });

      const unifiedBySymbol = new Map<string, Record<string, unknown>>();
      for (const raw of watchResult.rows) {
        const row = rowObject(raw);
        const symbol = String(row.symbol ?? "");
        if (!symbol || heldSymbols.has(symbol) || unifiedBySymbol.has(symbol)) continue;
        unifiedBySymbol.set(symbol, row);
      }

      watchRows = [...unifiedBySymbol.values()].map((row, index) => {
        const entryPrice = row.average_cost == null ? null : asNumber(row.average_cost);
        const currentPrice = row.current_price == null ? null : asNumber(row.current_price);
        const close10 = row.close_10d == null ? null : asNumber(row.close_10d);
        const close20 = row.close_20d == null ? null : asNumber(row.close_20d);
        const returnPct = entryPrice && currentPrice != null ? ((currentPrice / entryPrice) - 1) * 100 : null;
        const return10Pct = entryPrice && close10 != null ? ((close10 / entryPrice) - 1) * 100 : null;
        const return20Pct = entryPrice && close20 != null ? ((close20 / entryPrice) - 1) * 100 : null;
        return {
          symbol: String(row.symbol),
          stock_name: row.stock_name ?? "",
          market: row.market ?? "",
          holding_type: "watch",
          total_lots: 0,
          total_cost: 0,
          average_cost: entryPrice,
          current_price: currentPrice,
          trade_date: row.trade_date,
          market_value: null,
          unrealized_profit: null,
          unrealized_return_pct: returnPct,
          ai_target_price: row.ai_target_price,
          ai_stop_loss_price: row.ai_stop_loss_price,
          ai_action: row.ai_action,
          ai_confidence: row.ai_confidence,
          ai_score: row.ai_score,
          ai_plan_date: row.ai_plan_date,
          source: row.source ?? "watchlist",
          watch_source: row.watch_source ?? "自選觀察",
          status: row.status ?? "waiting",
          reason: row.reason ?? null,
          added_at: row.added_at,
          observation_no: index + 1,
          observation_days: asNumber(row.observation_days),
          return_10d_pct: return10Pct,
          return_20d_pct: return20Pct,
          lots: [],
        };
      });
    }

    const isLegacyCohort = (row: Record<string, unknown>) =>
      row.holding_type === "test" && String(row.strategy_tag ?? "").startsWith("stealth-radar-top20");
    const currentHoldingRows = holdingRows.filter((row) => !isLegacyCohort(row));
    const realRows = currentHoldingRows.filter((row) => row.holding_type === "real");
    const testRows = currentHoldingRows.filter((row) => row.holding_type === "test");
    const swing10TestRows = testRows.filter((row) => String(row.strategy_tag ?? "").startsWith("swing10"));

    const rows = filter === "real"
      ? realRows
      : filter === "test"
        ? testRows
        : filter === "watch"
          ? watchRows
          : [...currentHoldingRows, ...watchRows];

    const buildSummary = (selected: Array<Record<string, unknown>>) => {
      const totalCost = selected.reduce((sum, row) => sum + asNumber(row.total_cost), 0);
      const marketValue = selected.reduce((sum, row) => sum + asNumber(row.market_value), 0);
      const unrealizedProfit = marketValue - totalCost;
      const profitable = selected.filter((row) => row.unrealized_return_pct != null && asNumber(row.unrealized_return_pct) > 0).length;
      const nonProfitable = selected.filter((row) => row.unrealized_return_pct != null && asNumber(row.unrealized_return_pct) <= 0).length;
      const equalWeightReturns = selected
        .map((row) => row.unrealized_return_pct)
        .filter((value) => value != null)
        .map((value) => asNumber(value));
      const observationDays = selected.map((row) => asNumber(row.observation_days));
      return {
        count: selected.length,
        totalCost,
        marketValue,
        unrealizedProfit,
        unrealizedReturnPct: totalCost ? (unrealizedProfit / totalCost) * 100 : 0,
        averageReturnPct: equalWeightReturns.length ? equalWeightReturns.reduce((sum, value) => sum + value, 0) / equalWeightReturns.length : 0,
        profitable,
        nonProfitable,
        winRatePct: equalWeightReturns.length ? profitable / equalWeightReturns.length * 100 : 0,
        matured10: selected.filter((row) => asNumber(row.observation_days) >= 10).length,
        matured20: selected.filter((row) => asNumber(row.observation_days) >= 20).length,
        minObservationDays: observationDays.length ? Math.min(...observationDays) : 0,
        maxObservationDays: observationDays.length ? Math.max(...observationDays) : 0,
      };
    };

    // M8.11.8 Portfolio Dashboard Alignment: closed performance is a compact
    // one-query summary. Legacy Top20 Cohort remains in the database but is no
    // longer mixed into the live Swing10 dashboard.
    const historyResult = await db().execute({
      sql: `SELECT th.holding_type, th.realized_profit, th.realized_return_pct,
              COALESCE(pl.strategy_tag,'') AS strategy_tag, COALESCE(th.note,'') AS note
            FROM trade_history th
            LEFT JOIN portfolio_lots pl ON pl.id=th.lot_id
            WHERE th.user_name=?`,
      args: [USER_NAME],
    });
    const historyRows = Array.from(historyResult.rows as any[]).map(rowObject);
    const realizedSummary = (selected: Array<Record<string, unknown>>) => ({
      closedTrades: selected.length,
      realizedProfit: selected.reduce((sum,row)=>sum+asNumber(row.realized_profit),0),
      realizedWinRatePct: selected.length ? selected.filter(row=>asNumber(row.realized_profit)>0).length / selected.length * 100 : 0,
      averageRealizedReturnPct: selected.length ? selected.reduce((sum,row)=>sum+asNumber(row.realized_return_pct),0) / selected.length : 0,
    });
    const realHistory = historyRows.filter((row)=>row.holding_type === "real");
    const swing10History = historyRows.filter((row)=>row.holding_type === "test" && (String(row.strategy_tag).startsWith("swing10") || String(row.note).includes("Swing10")));

    const real = {...buildSummary(realRows), ...realizedSummary(realHistory)};
    const swing10Test = {...buildSummary(swing10TestRows), ...realizedSummary(swing10History)};
    const watchRowsForSummary = watchRows as Array<Record<string, unknown>>;
    const measurableWatchRows = watchRowsForSummary.filter((row) => row.unrealized_return_pct != null);
    const watch = {
      count: watchRowsForSummary.length,
      max: 20,
      completed: watchRowsForSummary.filter((row) => row.status === "completed").length,
      waiting: watchRowsForSummary.filter((row) => row.status !== "completed").length,
      profitable: measurableWatchRows.filter((row) => asNumber(row.unrealized_return_pct) > 0).length,
      nonProfitable: measurableWatchRows.filter((row) => asNumber(row.unrealized_return_pct) <= 0).length,
      measured: measurableWatchRows.length,
      averageReturnPct: measurableWatchRows.length ? measurableWatchRows.reduce((sum,row)=>sum+asNumber(row.unrealized_return_pct),0) / measurableWatchRows.length : 0,
      matured10: watchRowsForSummary.filter((row) => asNumber(row.observation_days) >= 10).length,
      matured20: watchRowsForSummary.filter((row) => asNumber(row.observation_days) >= 20).length,
      earlyWatchA: watchRowsForSummary.filter((row) => String(row.watch_source ?? "").includes("EW-A")).length,
      earlyWatchB: watchRowsForSummary.filter((row) => String(row.watch_source ?? "").includes("EW-B")).length,
    };

    return NextResponse.json({
      ok: true,
      filter,
      rows,
      summary: { real, swing10Test, watch },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
