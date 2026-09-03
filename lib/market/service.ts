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

type MarketInstrument = {
  symbol: string;
  displayName: string;
  category: "semiconductor" | "taiwan-futures" | "fx" | "risk";
  candidates: readonly string[];
};

/** M8.3：全球市場只保留四個台股核心風向訊號。 */
const INSTRUMENTS: readonly MarketInstrument[] = [
  { symbol: "SOX", displayName: "費城半導體", category: "semiconductor", candidates: ["^SOX"] },
  { symbol: "TW_NIGHT", displayName: "台指夜盤代理", category: "taiwan-futures", candidates: ["FITX", "TXF=F", "^TWII"] },
  { symbol: "USDTWD", displayName: "美元／台幣", category: "fx", candidates: ["TWD=X"] },
  { symbol: "VIX", displayName: "VIX 恐慌指數", category: "risk", candidates: ["^VIX"] },
] as const;

const CORE_SYMBOLS = INSTRUMENTS.map((instrument) => instrument.symbol);

const numberOrNull = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const dateInTaipei = (timestamp: number) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date(timestamp * 1000));

async function fetchYahooCandidate(candidate: string, instrument: MarketInstrument): Promise<MarketQuote> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(candidate)}?range=10d&interval=1d&events=history`;
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
  if (!response.ok) throw new Error(`${instrument.displayName} (${candidate})：HTTP ${response.status}`);
  const json = await response.json() as any;
  const result = json?.chart?.result?.[0];
  const timestamps: number[] = result?.timestamp ?? [];
  const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? [];
  const valid = timestamps.map((timestamp, index) => ({ timestamp, close: numberOrNull(closes[index]) }))
    .filter((row): row is { timestamp: number; close: number } => row.close !== null);
  const latest = valid.at(-1);
  const previous = valid.at(-2);
  if (!latest || latest.close <= 0) throw new Error(`${instrument.displayName} (${candidate}) 沒有有效正值行情`);
  if (previous && previous.close <= 0) throw new Error(`${instrument.displayName} (${candidate}) 前一日行情異常`);
  const changePct = previous && previous.close !== 0 ? ((latest.close - previous.close) / previous.close) * 100 : null;
  const maxAbsMove = instrument.category === "fx" ? 8 : instrument.category === "taiwan-futures" ? 15 : instrument.category === "semiconductor" ? 25 : 80;
  if (changePct != null && Math.abs(changePct) > maxAbsMove) {
    throw new Error(`${instrument.displayName} (${candidate}) 單日變動 ${changePct.toFixed(2)}% 超過資料品質上限 ${maxAbsMove}%`);
  }
  return {
    symbol: instrument.symbol,
    displayName: instrument.displayName,
    category: instrument.category,
    quoteDate: dateInTaipei(latest.timestamp),
    close: latest.close,
    previousClose: previous?.close ?? null,
    changePct,
    currency: result?.meta?.currency ?? null,
  };
}

async function fetchQuote(instrument: MarketInstrument): Promise<MarketQuote> {
  const failures: string[] = [];
  for (const candidate of instrument.candidates) {
    try { return await fetchYahooCandidate(candidate, instrument); }
    catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
  }
  throw new Error(`${instrument.displayName} 行情讀取失敗：${failures.join("；")}`);
}

/** Deterministic Market Pulse engine. No LLM or external AI API is used. */
export function calculateMarketRegime(quotes: MarketQuote[]) {
  const sox = quotes.find((quote) => quote.symbol === "SOX");
  const twNight = quotes.find((quote) => quote.symbol === "TW_NIGHT");
  const usdTwd = quotes.find((quote) => quote.symbol === "USDTWD");
  const vix = quotes.find((quote) => quote.symbol === "VIX");
  const soxChange = sox?.changePct ?? 0;
  const twNightChange = twNight?.changePct ?? 0;
  const usdTwdChange = usdTwd?.changePct ?? 0;
  const vixChange = vix?.changePct ?? 0;
  const vixLevel = vix?.close ?? 20;

  let score = 50;
  score += soxChange * 7.0;
  score += twNightChange * 8.0;
  score -= usdTwdChange * 8.0;
  score -= Math.max(0, vixLevel - 18) * 1.15;
  score -= Math.max(0, vixChange) * 0.9;
  score += Math.max(0, -vixChange) * 0.35;
  score = clamp(score);

  let regime = "中性";
  if (score >= 72) regime = "偏多";
  else if (score >= 58) regime = "略偏多";
  else if (score < 28) regime = "高風險";
  else if (score < 42) regime = "偏空";

  const riskLevel = score >= 70 ? "低" : score >= 55 ? "中低" : score >= 40 ? "中高" : "高";
  const marketFactor = Math.max(0.78, Math.min(1.04, 0.78 + score * 0.0026));
  const available = [sox, twNight, usdTwd, vix].filter(Boolean).length;
  const confidence = clamp(40 + available * 13, 0, 92);
  const reasons = [
    `費城半導體 ${soxChange.toFixed(2)}%`,
    `台指夜盤代理 ${twNightChange.toFixed(2)}%`,
    `美元／台幣 ${usdTwdChange.toFixed(2)}%`,
    `VIX ${vixLevel.toFixed(2)}（${vixChange.toFixed(2)}%）`,
  ];
  return {
    marketScore: Number(score.toFixed(2)), marketFactor: Number(marketFactor.toFixed(3)), regime,
    riskLevel, confidence: Number(confidence.toFixed(0)), reasons,
  };
}

export async function refreshMarketData() {
  const settled = await Promise.allSettled(INSTRUMENTS.map((instrument) => fetchQuote(instrument)));
  const quotes = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  if (quotes.length < 3) throw new Error(`市場風向資料不足，只成功取得 ${quotes.length}/4 項`);
  const client = getTursoClient();
  const now = new Date().toISOString();
  for (const quote of quotes) {
    await client.execute({
      sql: `INSERT INTO market_quotes_daily(symbol,quote_date,display_name,category,close,previous_close,change_pct,currency,source,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(symbol,quote_date) DO UPDATE SET display_name=excluded.display_name,category=excluded.category,
        close=excluded.close,previous_close=excluded.previous_close,change_pct=excluded.change_pct,currency=excluded.currency,source=excluded.source,updated_at=excluded.updated_at`,
      args: [quote.symbol, quote.quoteDate, quote.displayName, quote.category, quote.close, quote.previousClose, quote.changePct, quote.currency, "yahoo", now],
    });
  }
  const regime = calculateMarketRegime(quotes);
  const regimeDate = quotes.find((quote) => quote.symbol === "TW_NIGHT")?.quoteDate ?? quotes[0].quoteDate;
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
    const placeholders = CORE_SYMBOLS.map(() => "?").join(",");
    const [quotesResult, regimeResult] = await Promise.all([
      client.execute({
        sql: `SELECT q.* FROM market_quotes_daily q JOIN (
          SELECT symbol,MAX(quote_date) d FROM market_quotes_daily WHERE symbol IN (${placeholders}) GROUP BY symbol
        ) x ON x.symbol=q.symbol AND x.d=q.quote_date
        WHERE q.symbol IN (${placeholders})
        ORDER BY CASE q.symbol WHEN 'SOX' THEN 1 WHEN 'TW_NIGHT' THEN 2 WHEN 'USDTWD' THEN 3 WHEN 'VIX' THEN 4 ELSE 5 END`,
        args: [...CORE_SYMBOLS, ...CORE_SYMBOLS],
      }),
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

