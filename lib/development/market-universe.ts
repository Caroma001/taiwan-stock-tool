export type DailyUniverseStock = {
  symbol: string;
  name?: string | null;
  market?: string | null;
  industry?: string | null;
  is_active?: number | boolean | null;
};

export type DailyUniverseDecision = {
  eligible: boolean;
  reason: string | null;
};

const normalize = (value: unknown) =>
  String(value ?? "")
    .trim()
    .replace(/\u3000/g, " ")
    .toUpperCase();

// M8.10.6.3: identify products that can share a market label with common stock.
// The local stocks table is allowed to already be equity-only; in that case
// skipped can legitimately remain 0. The important rule is that anything that
// is clearly not a listed/OTC common equity must never consume a daily API call.
const EXCLUDED_NAME = /(?:ETF|ETN|權證|認購|認售|受益證券|指數型基金|債券型基金|基金|債券|期貨|選擇權|特別股|存託憑證|TDR|DR\b)/i;
const EXCLUDED_INDUSTRY = /(?:ETF|ETN|WARRANT|權證|基金|債券|BOND|FUND|INDEX|期貨|FUTURE|OPTION|存託憑證|TDR)/i;
const EXCLUDED_MARKET = /(?:興櫃|ESB|EMERGING|ETF|ETN|WARRANT|BOND|FUND|INDEX|FUTURE|OPTION)/i;

/**
 * M8.10.6.3 Taiwan Equity Universe
 *
 * Daily Stealth-Radar maintenance is intended for ordinary TWSE/TPEx equities.
 * Classification is deliberately conservative:
 * - common 4-digit numeric codes starting 1-9 stay eligible;
 * - 0xxx, alphanumeric and 5/6-digit product codes are excluded;
 * - 91xx TDR/depository-receipt codes are excluded from the stock-picking pool;
 * - explicit product words in name / market / industry are excluded;
 * - inactive rows are excluded.
 *
 * Important: some upstream stock masters already contain only ordinary shares.
 * In that case "skipped = 0" is valid and should not be interpreted as a bug.
 */
export function classifyDailyUniverseStock(stock: DailyUniverseStock): DailyUniverseDecision {
  const symbol = normalize(stock.symbol);
  const name = normalize(stock.name);
  const market = normalize(stock.market);
  const industry = normalize(stock.industry);

  if (Number(stock.is_active ?? 1) !== 1) {
    return { eligible: false, reason: "市場清單略過：股票已標記為非有效狀態" };
  }

  // Taiwan common shares are normally four numeric digits. This immediately
  // removes ETFs/ETNs with leading 0, warrants and alphanumeric preferred shares.
  if (!/^[1-9]\d{3}$/.test(symbol)) {
    return { eligible: false, reason: "市場清單略過：非一般上市櫃普通股四碼代號" };
  }

  // 91xx is reserved in practice for TDR / depository-receipt products and is
  // outside Bruce's common-stock Stealth Radar universe.
  if (/^91\d{2}$/.test(symbol)) {
    return { eligible: false, reason: "市場清單略過：TDR／存託憑證代號" };
  }

  if (EXCLUDED_NAME.test(name)) {
    return { eligible: false, reason: `市場清單略過：非普通股商品（${stock.name || symbol}）` };
  }

  if (EXCLUDED_INDUSTRY.test(industry)) {
    return { eligible: false, reason: `市場清單略過：非普通股產業分類（${stock.industry || "未分類"}）` };
  }

  if (EXCLUDED_MARKET.test(market)) {
    return { eligible: false, reason: `市場清單略過：非 TWSE/TPEx 普通股市場（${stock.market || market}）` };
  }

  return { eligible: true, reason: null };
}

export function summarizeDailyUniverse(stocks: DailyUniverseStock[]) {
  const summary = {
    total: stocks.length,
    eligible: 0,
    skipped: 0,
    reasons: new Map<string, number>(),
  };

  for (const stock of stocks) {
    const decision = classifyDailyUniverseStock(stock);
    if (decision.eligible) {
      summary.eligible += 1;
      continue;
    }
    summary.skipped += 1;
    const reason = decision.reason ?? "其他";
    summary.reasons.set(reason, (summary.reasons.get(reason) ?? 0) + 1);
  }

  return {
    total: summary.total,
    eligible: summary.eligible,
    skipped: summary.skipped,
    reasons: [...summary.reasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
  };
}
