import { getTursoClient } from "@/lib/turso/client";
import { ALGORITHM_VERSION } from "@/services/market-context";

export type MarketQuote = {
  symbol: string;
  displayName: string;
  category: string;
  quoteDate: string;
  close: number | null;
  previousClose: number | null;
  changePct: number | null;
  currency: string | null;
};

const INSTRUMENTS = [
  ["^TWII", "台灣加權", "equity"], ["^GSPC", "S&P 500", "equity"], ["^IXIC", "NASDAQ", "equity"], ["^DJI", "道瓊", "equity"],
  ["^N225", "日經 225", "equity"], ["^KS11", "KOSPI", "equity"], ["^HSI", "恆生", "equity"], ["000001.SS", "上證", "equity"],
  ["^VIX", "VIX", "risk"], ["DX-Y.NYB", "美元指數", "macro"], ["^TNX", "美債 10Y", "macro"], ["GC=F", "黃金", "commodity"],
  ["CL=F", "WTI 原油", "commodity"], ["BTC-USD", "Bitcoin", "crypto"], ["ETH-USD", "Ethereum", "crypto"],
] as const;

const numberOrNull = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const dateInTaipei = (timestamp: number) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date(timestamp * 1000));

async function fetchQuote(symbol: string, displayName: string, category: string): Promise<MarketQuote> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=10d&interval=1d&events=history`;
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
  if (!response.ok) throw new Error(`${displayName} 行情讀取失敗：HTTP ${response.status}`);
  const json = await response.json() as any;
  const result = json?.chart?.result?.[0];
  const timestamps: number[] = result?.timestamp ?? [];
  const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? [];
  const valid = timestamps.map((timestamp, index) => ({ timestamp, close: numberOrNull(closes[index]) }))
    .filter((row): row is { timestamp: number; close: number } => row.close !== null);
  const latest = valid.at(-1);
  const previous = valid.at(-2);
  if (!latest) throw new Error(`${displayName} 沒有有效行情`);
  const changePct = previous && previous.close !== 0 ? ((latest.close - previous.close) / previous.close) * 100 : null;
  return {
    symbol, displayName, category, quoteDate: dateInTaipei(latest.timestamp), close: latest.close,
    previousClose: previous?.close ?? null, changePct, currency: result?.meta?.currency ?? null,
  };
}

/** Deterministic market regime engine. No LLM or external AI API is used. */
export function calculateMarketRegime(quotes: MarketQuote[]) {
  const equities = quotes.filter((quote) => quote.category === "equity" && quote.changePct !== null);
  const changes = equities.map((quote) => quote.changePct as number);
  const globalAverage = average(changes);
  const breadth = changes.length ? changes.filter((value) => value > 0).length / changes.length : 0.5;
  const downsideBreadth = changes.length ? changes.filter((value) => value <= -2).length / changes.length : 0;
  const taiwan = quotes.find((quote) => quote.symbol === "^TWII")?.changePct ?? 0;
  const kospi = quotes.find((quote) => quote.symbol === "^KS11")?.changePct ?? 0;
  const nasdaq = quotes.find((quote) => quote.symbol === "^IXIC")?.changePct ?? 0;
  const vix = quotes.find((quote) => quote.symbol === "^VIX")?.close ?? 20;
  const us10y = quotes.find((quote) => quote.symbol === "^TNX")?.changePct ?? 0;

  let score = 50;
  score += globalAverage * 5.5;
  score += taiwan * 5.5;
  score += nasdaq * 2.0;
  score += kospi * 1.5;
  score += (breadth - 0.5) * 26;
  score -= downsideBreadth * 18;
  score -= Math.max(0, vix - 18) * 1.15;
  score -= Math.max(0, us10y) * 0.8;
  score = clamp(score);

  let regime = "盤整";
  if (score >= 72) regime = "偏多";
  else if (score >= 58) regime = "復甦";
  else if (score < 25) regime = "恐慌";
  else if (score < 42) regime = "修正";

  const riskLevel = score >= 70 ? "低" : score >= 52 ? "中低" : score >= 38 ? "中高" : "高";
  const marketFactor = Math.max(0.65, Math.min(1.05, 0.65 + score * 0.004));
  const confidence = clamp(45 + equities.length * 5 + (quotes.some((quote) => quote.symbol === "^VIX") ? 10 : 0), 0, 92);
  const reasons = [
    `全球股市平均漲跌 ${globalAverage.toFixed(2)}%`,
    `上漲市場廣度 ${(breadth * 100).toFixed(0)}%`,
    `台灣加權 ${Number(taiwan).toFixed(2)}%`,
    `NASDAQ ${Number(nasdaq).toFixed(2)}%`,
    `KOSPI ${Number(kospi).toFixed(2)}%`,
    `VIX ${Number(vix).toFixed(2)}`,
  ];
  return {
    marketScore: Number(score.toFixed(2)), marketFactor: Number(marketFactor.toFixed(3)), regime,
    riskLevel, confidence: Number(confidence.toFixed(0)), reasons,
  };
}

export async function refreshMarketData() {
  const settled = await Promise.allSettled(INSTRUMENTS.map((instrument) => fetchQuote(instrument[0], instrument[1], instrument[2])));
  const quotes = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  if (quotes.length < 5) throw new Error(`全球市場資料不足，只成功取得 ${quotes.length} 項`);
  const client = getTursoClient();
  const now = new Date().toISOString();
  for (const quote of quotes) {
    await client.execute({
      sql: `INSERT INTO market_quotes_daily(symbol,quote_date,display_name,category,close,previous_close,change_pct,currency,source,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(symbol,quote_date) DO UPDATE SET close=excluded.close,previous_close=excluded.previous_close,
        change_pct=excluded.change_pct,currency=excluded.currency,updated_at=excluded.updated_at`,
      args: [quote.symbol, quote.quoteDate, quote.displayName, quote.category, quote.close, quote.previousClose, quote.changePct, quote.currency, "yahoo", now],
    });
  }
  const regime = calculateMarketRegime(quotes);
  const regimeDate = quotes.find((quote) => quote.symbol === "^TWII")?.quoteDate ?? quotes[0].quoteDate;
  await client.execute({
    sql: `INSERT INTO market_regime_daily(regime_date,market_score,market_factor,regime,risk_level,confidence,reasons_json,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(regime_date) DO UPDATE SET market_score=excluded.market_score,market_factor=excluded.market_factor,
      regime=excluded.regime,risk_level=excluded.risk_level,confidence=excluded.confidence,reasons_json=excluded.reasons_json,updated_at=excluded.updated_at`,
    args: [regimeDate, regime.marketScore, regime.marketFactor, regime.regime, regime.riskLevel, regime.confidence, JSON.stringify(regime.reasons), now, now],
  });
  return { quotes, regimeDate, ...regime, failed: settled.length - quotes.length, algorithmVersion: ALGORITHM_VERSION };
}

export async function readLatestMarket() {
  const client = getTursoClient();
  try {
    const [quotesResult, regimeResult] = await Promise.all([
      client.execute(`SELECT q.* FROM market_quotes_daily q JOIN (SELECT symbol,MAX(quote_date) d FROM market_quotes_daily GROUP BY symbol) x
        ON x.symbol=q.symbol AND x.d=q.quote_date ORDER BY CASE q.category WHEN 'equity' THEN 1 WHEN 'risk' THEN 2 WHEN 'macro' THEN 3 WHEN 'commodity' THEN 4 ELSE 5 END,q.symbol`),
      client.execute(`SELECT * FROM market_regime_daily ORDER BY regime_date DESC LIMIT 1`),
    ]);
    return {
      quotes: quotesResult.rows.map((row) => ({
        symbol: String(row.symbol), displayName: String(row.display_name), category: String(row.category), quoteDate: String(row.quote_date),
        close: numberOrNull(row.close), previousClose: numberOrNull(row.previous_close), changePct: numberOrNull(row.change_pct),
        currency: row.currency ? String(row.currency) : null,
      })),
      regime: regimeResult.rows[0] ?? null,
    };
  } catch {
    return { quotes: [] as MarketQuote[], regime: null };
  }
}

function classifyValidationStatus(params: {
  current: number | null; target1: number | null; target2: number | null; stopLoss: number | null;
  tradingDays: number; returnPct: number | null; horizon: number;
}) {
  if (params.current !== null && params.target2 !== null && params.current >= params.target2) return "第二目標達成";
  if (params.current !== null && params.target1 !== null && params.current >= params.target1) return "第一目標達成";
  if (params.current !== null && params.stopLoss !== null && params.current <= params.stopLoss) return "停損觸發";
  if (params.tradingDays >= params.horizon) return (params.returnPct ?? 0) > 0 ? "到期獲利" : "到期虧損";
  return "追蹤中";
}

export async function refreshValidationSnapshots() {
  const client = getTursoClient();
  const now = new Date().toISOString();
  const snapshotDate = now.slice(0, 10);
  const settings = await client.execute(`SELECT validation_horizon_days,algorithm_version FROM algorithm_settings WHERE id=1`);
  const horizon = Number(settings.rows[0]?.validation_horizon_days ?? 10);
  const version = String(settings.rows[0]?.algorithm_version ?? ALGORITHM_VERSION);
  const lots = await client.execute(`SELECT l.id,l.symbol,l.buy_date,l.buy_price,l.remaining_lots,d.target_1,d.target_2,d.stop_loss,d.confidence,
    a.final_score,a.total_score,a.market_score entry_market_score,a.market_regime entry_market_regime,a.algorithm_version,
    (SELECT close FROM daily_prices p WHERE p.symbol=l.symbol ORDER BY trade_date DESC LIMIT 1) current_price,
    (SELECT MAX(high) FROM daily_prices p WHERE p.symbol=l.symbol AND p.trade_date>=l.buy_date) highest_price,
    (SELECT MIN(low) FROM daily_prices p WHERE p.symbol=l.symbol AND p.trade_date>=l.buy_date) lowest_price,
    (SELECT COUNT(*) FROM daily_prices p WHERE p.symbol=l.symbol AND p.trade_date>=l.buy_date) trading_days
    FROM portfolio_lots l LEFT JOIN decision_latest d ON d.symbol=l.symbol LEFT JOIN ai_analysis_latest a ON a.symbol=l.symbol
    WHERE l.holding_type='test' AND l.status='open' AND l.remaining_lots>0`);
  const currentMarket = await client.execute(`SELECT market_score,regime FROM market_regime_daily ORDER BY regime_date DESC LIMIT 1`);
  const marketRow = currentMarket.rows[0];

  for (const row of lots.rows) {
    const entry = Number(row.buy_price);
    const current = numberOrNull(row.current_price);
    const highest = numberOrNull(row.highest_price);
    const lowest = numberOrNull(row.lowest_price);
    const returnPct = current === null ? null : ((current - entry) / entry) * 100;
    const maxGainPct = highest === null ? null : ((highest - entry) / entry) * 100;
    const maxDrawdownPct = lowest === null ? null : ((lowest - entry) / entry) * 100;
    const tradingDays = Math.max(0, Number(row.trading_days ?? 0) - 1);
    const status = classifyValidationStatus({
      current, target1: numberOrNull(row.target_1), target2: numberOrNull(row.target_2), stopLoss: numberOrNull(row.stop_loss),
      tradingDays, returnPct, horizon,
    });
    await client.execute({
      sql: `INSERT INTO validation_snapshots(snapshot_date,lot_id,symbol,buy_date,entry_price,current_price,return_pct,highest_price,lowest_price,
        target_1,target_2,stop_loss,result_status,market_score,market_regime,ai_score,confidence,holding_days,updated_at,
        max_gain_pct,max_drawdown_pct,trading_days,entry_market_score,entry_market_regime,entry_ai_score,algorithm_version)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(snapshot_date,lot_id) DO UPDATE SET
        current_price=excluded.current_price,return_pct=excluded.return_pct,highest_price=excluded.highest_price,lowest_price=excluded.lowest_price,
        result_status=excluded.result_status,market_score=excluded.market_score,market_regime=excluded.market_regime,ai_score=excluded.ai_score,
        confidence=excluded.confidence,holding_days=excluded.holding_days,max_gain_pct=excluded.max_gain_pct,max_drawdown_pct=excluded.max_drawdown_pct,
        trading_days=excluded.trading_days,updated_at=excluded.updated_at`,
      args: [snapshotDate, String(row.id), String(row.symbol), String(row.buy_date), entry, current, returnPct, highest, lowest,
        numberOrNull(row.target_1), numberOrNull(row.target_2), numberOrNull(row.stop_loss), status,
        numberOrNull(marketRow?.market_score), marketRow?.regime ? String(marketRow.regime) : null,
        numberOrNull(row.final_score ?? row.total_score), numberOrNull(row.confidence), tradingDays, now,
        maxGainPct, maxDrawdownPct, tradingDays, numberOrNull(row.entry_market_score), row.entry_market_regime ? String(row.entry_market_regime) : null,
        numberOrNull(row.final_score ?? row.total_score), String(row.algorithm_version ?? version)],
    });
  }

  const metrics = await readValidationCenter();
  await client.execute({
    sql: `INSERT INTO validation_metrics_daily(metric_date,total_samples,active_samples,completed_samples,winning_samples,win_rate,average_return,
      average_max_gain,average_max_drawdown,market_regime,algorithm_version,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(metric_date) DO UPDATE SET total_samples=excluded.total_samples,active_samples=excluded.active_samples,
      completed_samples=excluded.completed_samples,winning_samples=excluded.winning_samples,win_rate=excluded.win_rate,
      average_return=excluded.average_return,average_max_gain=excluded.average_max_gain,average_max_drawdown=excluded.average_max_drawdown,
      market_regime=excluded.market_regime,algorithm_version=excluded.algorithm_version,updated_at=excluded.updated_at`,
    args: [snapshotDate, metrics.summary.samples, metrics.summary.active, metrics.summary.completed, metrics.summary.wins,
      metrics.summary.winRate, metrics.summary.averageReturn, metrics.summary.averageMaxGain, metrics.summary.averageMaxDrawdown,
      marketRow?.regime ? String(marketRow.regime) : null, version, now],
  });
  return { date: snapshotDate, count: lots.rows.length, horizon, algorithmVersion: version };
}

export async function readValidationCenter() {
  const client = getTursoClient();
  try {
    const result = await client.execute(`SELECT v.*,s.name stock_name FROM validation_snapshots v JOIN stocks s ON s.symbol=v.symbol
      WHERE v.snapshot_date=(SELECT MAX(snapshot_date) FROM validation_snapshots) ORDER BY v.return_pct DESC`);
    const rows = result.rows;
    const completed = rows.filter((row) => String(row.result_status) !== "追蹤中");
    const wins = completed.filter((row) => ["第一目標達成", "第二目標達成", "到期獲利"].includes(String(row.result_status)));
    const active = rows.length - completed.length;
    const avg = average(rows.map((row) => Number(row.return_pct ?? 0)));
    const avgGain = average(rows.map((row) => Number(row.max_gain_pct ?? 0)));
    const avgDrawdown = average(rows.map((row) => Number(row.max_drawdown_pct ?? 0)));
    return {
      rows: rows.map((row) => ({ ...row })),
      summary: {
        samples: rows.length, active, completed: completed.length, wins: wins.length,
        winRate: completed.length ? wins.length / completed.length * 100 : 0,
        averageReturn: avg, averageMaxGain: avgGain, averageMaxDrawdown: avgDrawdown,
      },
    };
  } catch {
    return { rows: [], summary: { samples: 0, active: 0, completed: 0, wins: 0, winRate: 0, averageReturn: 0, averageMaxGain: 0, averageMaxDrawdown: 0 } };
  }
}
