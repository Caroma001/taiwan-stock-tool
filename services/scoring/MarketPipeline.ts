import { randomUUID } from "node:crypto";
import type { DatabaseAdapter, DatabaseRow, DatabaseStatement } from "@/lib/database";
import { calculateLatestIndicator, type IndicatorPriceRow } from "@/services/Indicators/IndicatorCalculator";
import { FinMindPriceProvider } from "@/providers/FinMindPriceProvider";
import { refreshForeignAccumulationForSymbol } from "@/lib/foreign-accumulation";
import { scoreIndicator } from "./ScoringEngine";
import { applyMarketContext, createMarketAwareDecision, defaultMarketContext, type MarketContext } from "@/services/market-context";
import type { IndicatorDbRow, PriceRow, StockRow } from "./types";

interface CountRow extends DatabaseRow { count: number; }
interface LatestDateRow extends DatabaseRow { latest_date: string | null; }
interface SyncCheckpointRow extends DatabaseRow {
  price_latest_date: string | null;
  foreign_latest_date: string | null;
  foreign_data_days: number;
  indicator_latest_date: string | null;
}
interface MarketContextRow extends DatabaseRow { market_score: number; regime: string; risk_level: string; confidence: number; }
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (days: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - days); return isoDate(d); };
const nextDay = (value: string) => { const d = new Date(`${value}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return isoDate(d); };

export class MarketPipeline {
  private marketContextCache: MarketContext | null = null;

  constructor(private readonly db: DatabaseAdapter) {}

  async dryRun(symbols?: string[]) {
    const stockResult = symbols?.length ? { rows: symbols.map(symbol => ({ symbol, name: symbol, is_active: 1 })) as StockRow[] } : await this.db.execute<StockRow>({ sql: "SELECT symbol,name,is_active FROM stocks WHERE is_active=1 ORDER BY symbol" });
    return { mode: "dry-run", symbols: stockResult.rows.length, stages: ["prices", "indicators", "analysis", "decisions", "ranking"], estimatedApiCalls: 4, engine: "bulk-daily-snapshot" };
  }

  async run(options: { symbols?: string[]; historyDays?: number; rateLimitMs?: number } = {}) {
    const runId = randomUUID(); const started = new Date().toISOString();
    const stocks = options.symbols?.length
      ? options.symbols.map(symbol => ({ symbol, name: symbol, is_active: 1 } as StockRow))
      : [...(await this.db.execute<StockRow>({ sql: "SELECT symbol,name,is_active FROM stocks WHERE is_active=1 ORDER BY symbol" })).rows];
    await this.db.execute({ sql: "INSERT INTO market_pipeline_runs(id,mode,status,stage,total_symbols,started_at,updated_at) VALUES(?,?,?,?,?,?,?)", args: [runId, options.symbols ? "test" : "full", "running", "prices", stocks.length, started, started] });
    const market = await this.readMarketContext();
    let success = 0, failed = 0;
    for (const stock of stocks) {
      try {
        await this.processSymbol(stock.symbol, market);
        success += 1;
      } catch (error) {
        failed += 1;
        await this.db.execute({ sql: "INSERT INTO market_pipeline_tasks(run_id,symbol,status,stage,attempts,last_error,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(run_id,symbol) DO UPDATE SET status=excluded.status,attempts=excluded.attempts,last_error=excluded.last_error,updated_at=excluded.updated_at", args: [runId, stock.symbol, "failed", "pipeline", 1, error instanceof Error ? error.message.slice(0,900) : String(error).slice(0,900), new Date().toISOString()] });
      }
      await this.db.execute({ sql: "UPDATE market_pipeline_runs SET processed_symbols=?,success_symbols=?,failed_symbols=?,current_symbol=?,updated_at=? WHERE id=?", args: [success+failed,success,failed,stock.symbol,new Date().toISOString(),runId] });
      if (options.rateLimitMs) await new Promise(resolve => setTimeout(resolve, options.rateLimitMs));
    }
    await this.refreshTop30();
    await this.db.execute({ sql: "UPDATE market_pipeline_runs SET status='completed',stage='ranking',completed_at=?,updated_at=? WHERE id=?", args: [new Date().toISOString(),new Date().toISOString(),runId] });
    return { runId, total: stocks.length, success, failed };
  }

  async runSingleSymbol(symbol: string, options: { refreshTop30?: boolean; targetTradeDate?: string; bulkSnapshotReady?: boolean } = {}) {
    const market = await this.readMarketContext();
    await this.processSymbol(symbol, market, options);
    const ranking = options.refreshTop30 === false ? null : await this.refreshTop30();
    return { symbol, success: 1, failed: 0, ranking };
  }

  private async readMarketContext(): Promise<MarketContext> {
    if (this.marketContextCache) return this.marketContextCache;
    try {
      const result = await this.db.execute<MarketContextRow>({
        sql: "SELECT market_score,regime,risk_level,confidence FROM market_regime_daily ORDER BY regime_date DESC LIMIT 1",
      });
      const row = result.rows[0];
      this.marketContextCache = row ? {
        score: Number(row.market_score ?? 50),
        regime: String(row.regime ?? "盤整"),
        riskLevel: String(row.risk_level ?? "中"),
        confidence: Number(row.confidence ?? 50),
      } : defaultMarketContext();
    } catch {
      this.marketContextCache = defaultMarketContext();
    }
    return this.marketContextCache;
  }

  private async processSymbol(symbol: string, market: MarketContext, options: { targetTradeDate?: string; bulkSnapshotReady?: boolean } = {}) {
    // M8.10.9: use a one-row checkpoint first. The legacy MAX(daily_prices)
    // aggregate is avoided on the normal path. Existing installations that do
    // not yet have a checkpoint fall back to indicator_latest (also one row).
    let checkpoint: SyncCheckpointRow | undefined;
    try {
      checkpoint = (await this.db.execute<SyncCheckpointRow>({
        sql: `SELECT c.price_latest_date,c.foreign_latest_date,c.foreign_data_days,
          i.trade_date AS indicator_latest_date
          FROM stock_sync_checkpoint c LEFT JOIN indicator_latest i ON i.symbol=c.symbol
          WHERE c.symbol=? LIMIT 1`,
        args: [symbol],
      })).rows[0];
    } catch {
      checkpoint = undefined;
    }

    let previousPriceDate = checkpoint?.price_latest_date ? String(checkpoint.price_latest_date) : null;
    let indicatorLatestDate = checkpoint?.indicator_latest_date ? String(checkpoint.indicator_latest_date) : null;
    if (!previousPriceDate || !indicatorLatestDate) {
      const indicatorDate = await this.db.execute<LatestDateRow>({
        sql: "SELECT trade_date AS latest_date FROM indicator_latest WHERE symbol=? LIMIT 1",
        args: [symbol],
      });
      indicatorLatestDate = indicatorLatestDate ?? (indicatorDate.rows[0]?.latest_date ? String(indicatorDate.rows[0].latest_date) : null);
      previousPriceDate = previousPriceDate ?? indicatorLatestDate;
    }

    // M8.10.20: the job's effective trading date is immutable. A Saturday/Sunday
    // Queue resume must never ask an upstream provider for the calendar date.
    const endDate = options.targetTradeDate ?? isoDate(new Date());
    const startDate = previousPriceDate ? nextDay(previousPriceDate) : daysAgo(760);
    const prices = options.bulkSnapshotReady
      ? []
      : previousPriceDate && previousPriceDate >= endDate
        ? []
        : await FinMindPriceProvider.fetchPrices({ symbol, startDate, endDate });
    if (prices.length) {
      const writeNow = new Date().toISOString();
      await this.db.executeMany(prices.map(row => ({
        sql: `INSERT INTO daily_prices(symbol,trade_date,open,high,low,close,volume,turnover,source,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(symbol,trade_date) DO UPDATE SET
          open=excluded.open,high=excluded.high,low=excluded.low,close=excluded.close,
          volume=excluded.volume,turnover=excluded.turnover,source=excluded.source,updated_at=excluded.updated_at`,
        args: [row.symbol,row.trade_date,row.open,row.high,row.low,row.close,row.volume,row.turnover,row.source,writeNow],
      })));
    }

    // Foreign accumulation remains market-wide because it is the feeder for the
    // Stealth Radar universe, but its own checkpoint is now a one-row snapshot.
    let foreignTradeDate: string | null = checkpoint?.foreign_latest_date ? String(checkpoint.foreign_latest_date) : null;
    let foreignDataDays = Number(checkpoint?.foreign_data_days ?? 0);
    if (options.bulkSnapshotReady) {
      // M8.10.20 bulk engine already calculated foreign_accumulation_latest for
      // the entire market in chunked reads. Do not perform another per-symbol
      // 60+61 history read here.
      foreignTradeDate = endDate;
    } else {
      try {
        const foreign = await refreshForeignAccumulationForSymbol(symbol, {
          db: this.db,
          checkpoint: { latestDate: foreignTradeDate, dataDays: foreignDataDays },
          targetTradeDate: endDate,
          skipExternalFetch: false,
        });
        foreignTradeDate = foreign.tradeDate;
        foreignDataDays = foreign.dataDays;
      } catch (error) {
        console.warn(`[foreign accumulation] ${symbol}:`, error instanceof Error ? error.message : String(error));
      }
    }

    // M8.10.20 bulk mode loads the new daily price before symbol analysis. That
    // means `prices.length===0` no longer means "nothing changed". Compare the
    // indicator checkpoint with the immutable target date instead.
    const hasNewPrice = prices.length > 0;
    const priceReadyForTarget = Boolean(previousPriceDate && previousPriceDate >= endDate) || hasNewPrice;
    const indicatorAlreadyCurrent = Boolean(indicatorLatestDate && indicatorLatestDate >= endDate);
    if (options.bulkSnapshotReady && !priceReadyForTarget) {
      // Suspended/no-trade securities can legitimately be absent from the daily
      // snapshot. Keep their last valid analysis without falling back to 2,143
      // single-stock API calls.
      return;
    }
    if (!hasNewPrice && indicatorAlreadyCurrent) {
      const now = new Date().toISOString();
      await this.db.execute({
        sql: `INSERT INTO stock_sync_checkpoint(symbol,price_latest_date,foreign_latest_date,foreign_data_days,last_full_refresh_at,updated_at)
          VALUES(?,?,?,?,?,?)
          ON CONFLICT(symbol) DO UPDATE SET
            price_latest_date=COALESCE(excluded.price_latest_date,stock_sync_checkpoint.price_latest_date),
            foreign_latest_date=COALESCE(excluded.foreign_latest_date,stock_sync_checkpoint.foreign_latest_date),
            foreign_data_days=MAX(stock_sync_checkpoint.foreign_data_days,excluded.foreign_data_days),
            updated_at=excluded.updated_at`,
        args: [symbol,previousPriceDate,foreignTradeDate,foreignDataDays,null,now],
      }).catch(() => undefined);
      return;
    }

    // 260 rows are sufficient for MA240 plus indicator warm-up; the old code read
    // 300 rows. Winner25/Stealth is no longer calculated for all ~2,143 symbols
    // here — the unified post-process scores only the final Top40 candidate pool.
    const history = await this.db.execute<PriceRow>({
      sql: "SELECT symbol,trade_date,open,high,low,close,volume,turnover FROM daily_prices WHERE symbol=? ORDER BY trade_date DESC LIMIT 260",
      args: [symbol],
    });
    const latestIndicator = calculateLatestIndicator([...history.rows].reverse() as IndicatorPriceRow[]);
    if (!latestIndicator) return;
    const indicator: IndicatorDbRow = latestIndicator;
    await this.db.execute({ sql: `INSERT INTO indicator_latest(symbol,trade_date,close,ma5,ma10,ma20,ma60,ma120,ma240,volume_ma5,volume_ma20,rsi14,k,d,macd,macd_signal,macd_histogram,bollinger_upper,bollinger_middle,bollinger_lower,atr14,calculated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(symbol) DO UPDATE SET trade_date=excluded.trade_date,close=excluded.close,ma5=excluded.ma5,ma10=excluded.ma10,ma20=excluded.ma20,ma60=excluded.ma60,ma120=excluded.ma120,ma240=excluded.ma240,volume_ma5=excluded.volume_ma5,volume_ma20=excluded.volume_ma20,rsi14=excluded.rsi14,k=excluded.k,d=excluded.d,macd=excluded.macd,macd_signal=excluded.macd_signal,macd_histogram=excluded.macd_histogram,bollinger_upper=excluded.bollinger_upper,bollinger_middle=excluded.bollinger_middle,bollinger_lower=excluded.bollinger_lower,atr14=excluded.atr14,calculated_at=excluded.calculated_at`, args: [indicator.symbol,indicator.trade_date,indicator.close,indicator.ma5,indicator.ma10,indicator.ma20,indicator.ma60,indicator.ma120,indicator.ma240,indicator.volume_ma5,indicator.volume_ma20,indicator.rsi14,indicator.k,indicator.d,indicator.macd,indicator.macd_signal,indicator.macd_histogram,indicator.bollinger_upper,indicator.bollinger_middle,indicator.bollinger_lower,indicator.atr14,indicator.calculated_at] });
    const baseAnalysis = scoreIndicator(indicator);
    const analysis = applyMarketContext(baseAnalysis, market);
    const decision = createMarketAwareDecision(indicator, analysis);
    const now = new Date().toISOString();
    await this.db.execute({ sql: `INSERT INTO ai_analysis_latest(symbol,trade_date,trend_score,momentum_score,volume_score,risk_score,total_score,confidence,reasons_json,calculated_at,raw_score,market_adjustment,final_score,market_score,market_regime,algorithm_version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(symbol) DO UPDATE SET trade_date=excluded.trade_date,trend_score=excluded.trend_score,momentum_score=excluded.momentum_score,volume_score=excluded.volume_score,risk_score=excluded.risk_score,total_score=excluded.total_score,confidence=excluded.confidence,reasons_json=excluded.reasons_json,calculated_at=excluded.calculated_at,raw_score=excluded.raw_score,market_adjustment=excluded.market_adjustment,final_score=excluded.final_score,market_score=excluded.market_score,market_regime=excluded.market_regime,algorithm_version=excluded.algorithm_version`, args: [symbol,indicator.trade_date,analysis.trendScore,analysis.momentumScore,analysis.volumeScore,analysis.riskScore,analysis.finalScore,analysis.confidence,JSON.stringify(analysis.reasons),now,analysis.rawScore,analysis.marketAdjustment,analysis.finalScore,analysis.marketScore,analysis.marketRegime,analysis.algorithmVersion] });
    await this.db.execute({ sql: `INSERT INTO decision_latest(symbol,trade_date,recommendation,target_1,target_2,stop_loss,expected_return,risk_reward,holding_days,confidence,reason,calculated_at,market_score,market_regime,algorithm_version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(symbol) DO UPDATE SET trade_date=excluded.trade_date,recommendation=excluded.recommendation,target_1=excluded.target_1,target_2=excluded.target_2,stop_loss=excluded.stop_loss,expected_return=excluded.expected_return,risk_reward=excluded.risk_reward,holding_days=excluded.holding_days,confidence=excluded.confidence,reason=excluded.reason,calculated_at=excluded.calculated_at,market_score=excluded.market_score,market_regime=excluded.market_regime,algorithm_version=excluded.algorithm_version`, args: [symbol,indicator.trade_date,decision.recommendation,decision.target1,decision.target2,decision.stopLoss,decision.expectedReturn,decision.riskReward,decision.holdingDays,decision.confidence,decision.reason,now,analysis.marketScore,analysis.marketRegime,analysis.algorithmVersion] });

    await this.db.execute({
      sql: `INSERT INTO stock_sync_checkpoint(symbol,price_latest_date,foreign_latest_date,foreign_data_days,last_full_refresh_at,updated_at)
        VALUES(?,?,?,?,?,?)
        ON CONFLICT(symbol) DO UPDATE SET
          price_latest_date=excluded.price_latest_date,
          foreign_latest_date=COALESCE(excluded.foreign_latest_date,stock_sync_checkpoint.foreign_latest_date),
          foreign_data_days=MAX(stock_sync_checkpoint.foreign_data_days,excluded.foreign_data_days),
          last_full_refresh_at=excluded.last_full_refresh_at,
          updated_at=excluded.updated_at`,
      args: [symbol,indicator.trade_date,foreignTradeDate,foreignDataDays,now,now],
    }).catch(() => undefined);
  }

  async refreshTop30() {
    const latest = await this.db.execute<LatestDateRow>({ sql: "SELECT MAX(trade_date) AS latest_date FROM decision_latest" });
    const snapshotDate = latest.rows[0]?.latest_date ?? isoDate(new Date()); const now = new Date().toISOString();
    await this.db.transaction(async tx => {
      await tx.execute({ sql: "DELETE FROM top30_snapshots WHERE snapshot_date=?", args: [snapshotDate] });
      await tx.execute({ sql: `INSERT INTO top30_snapshots(snapshot_date,rank,symbol,total_score,recommendation,close,target_1,target_2,stop_loss,expected_return,risk_reward,confidence,created_at,raw_score,market_adjustment,market_score,market_regime,algorithm_version)
        SELECT ?, ROW_NUMBER() OVER (ORDER BY COALESCE(a.final_score,a.total_score) DESC, d.risk_reward DESC, a.confidence DESC), a.symbol, COALESCE(a.final_score,a.total_score), d.recommendation, i.close, d.target_1, d.target_2, d.stop_loss, d.expected_return, d.risk_reward, a.confidence, ?, COALESCE(a.raw_score,a.total_score), COALESCE(a.market_adjustment,0), a.market_score, a.market_regime, a.algorithm_version
        FROM ai_analysis_latest a JOIN decision_latest d ON d.symbol=a.symbol JOIN indicator_latest i ON i.symbol=a.symbol
        WHERE d.recommendation IN ('強勢觀察','買進觀察','續抱') ORDER BY COALESCE(a.final_score,a.total_score) DESC, d.risk_reward DESC, a.confidence DESC LIMIT 30`, args: [snapshotDate,now] });
    });
    const count = await this.db.execute<CountRow>({ sql: "SELECT COUNT(*) AS count FROM top30_snapshots WHERE snapshot_date=?", args: [snapshotDate] });
    return { snapshotDate, count: Number(count.rows[0]?.count ?? 0) };
  }
}
