const FINMIND_API = "https://api.finmindtrade.com/api/v4/data";
const TDCC_OPENAPI = "https://openapi.tdcc.com.tw/v1/opendata/1-5";
const TDCC_LEGACY_CSV = "https://opendata.tdcc.com.tw/getOD.ashx?id=1-5";

const numberValue = (value: unknown) => {
  const normalized = String(value ?? "").replace(/[,%\s]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

async function fetchFinMind<T>(dataset: string, symbol: string, startDate: string, endDate?: string): Promise<T[]> {
  const url = new URL(FINMIND_API);
  url.searchParams.set("dataset", dataset);
  url.searchParams.set("data_id", symbol);
  url.searchParams.set("start_date", startDate);
  if (endDate) url.searchParams.set("end_date", endDate);
  const token = process.env.FINMIND_API_TOKEN ?? process.env.FINMIND_TOKEN;
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
  const response = await fetch(url, { cache: "no-store", headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || Number((payload as { status?: unknown }).status) !== 200) {
    const p = payload as Record<string, unknown>;
    throw new Error(String(p.msg ?? p.message ?? `FinMind ${dataset} HTTP ${response.status}`));
  }
  const data = (payload as { data?: unknown }).data;
  return Array.isArray(data) ? data as T[] : [];
}

export type ForeignHoldingRow = {
  symbol: string;
  tradeDate: string;
  holdingShares: number;
  holdingPct: number;
  issuedShares: number;
  source: string;
};

export async function fetchForeignHolding(symbol: string, startDate: string, endDate?: string): Promise<ForeignHoldingRow[]> {
  type ApiRow = {
    date: string; stock_id: string; ForeignInvestmentShares: number;
    ForeignInvestmentSharesRatio: number; NumberOfSharesIssued: number;
  };
  const rows = await fetchFinMind<ApiRow>("TaiwanStockShareholding", symbol, startDate, endDate);
  return rows.map((row) => ({
    symbol: String(row.stock_id ?? symbol),
    tradeDate: String(row.date),
    holdingShares: numberValue(row.ForeignInvestmentShares),
    holdingPct: numberValue(row.ForeignInvestmentSharesRatio),
    issuedShares: numberValue(row.NumberOfSharesIssued),
    source: "finmind:TaiwanStockShareholding",
  })).filter((row) => row.tradeDate && row.holdingPct >= 0);
}

export type TrustTradingRow = {
  symbol: string;
  tradeDate: string;
  foreignNet: number;
  trustNet: number;
  dealerNet: number;
  source: string;
};

export async function fetchTrustTrading(symbol: string, startDate: string, endDate?: string): Promise<TrustTradingRow[]> {
  type Wide = Record<string, unknown> & { date: string; stock_id: string };
  const rows = await fetchFinMind<Wide>("TaiwanStockInstitutionalInvestorsBuySellWide", symbol, startDate, endDate);
  return rows.map((row) => {
    const foreignBuy = numberValue(row.Foreign_Investor_buy) + numberValue(row.Foreign_Dealer_Self_buy);
    const foreignSell = numberValue(row.Foreign_Investor_sell) + numberValue(row.Foreign_Dealer_Self_sell);
    const dealerBuy = numberValue(row.Dealer_buy) + numberValue(row.Dealer_self_buy) + numberValue(row.Dealer_Hedging_buy);
    const dealerSell = numberValue(row.Dealer_sell) + numberValue(row.Dealer_self_sell) + numberValue(row.Dealer_Hedging_sell);
    return {
      symbol: String(row.stock_id ?? symbol), tradeDate: String(row.date),
      foreignNet: foreignBuy - foreignSell,
      trustNet: numberValue(row.Investment_Trust_buy) - numberValue(row.Investment_Trust_sell),
      dealerNet: dealerBuy - dealerSell,
      source: "finmind:TaiwanStockInstitutionalInvestorsBuySellWide",
    };
  }).filter((row) => row.tradeDate);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell.trim()); cell = "";
      if (row.some(Boolean)) rows.push(row); row = [];
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); }
  return rows;
}

export type DistributionLevelRow = {
  symbol: string; reportDate: string; level: string; people: number; shares: number; percent: number; source: string;
};

function findColumn(headers: string[], patterns: RegExp[], fallback: number) {
  const index = headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
  return index >= 0 ? index : fallback;
}

function normalizeDate(value: unknown) {
  const raw = String(value ?? "").trim();
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  return raw.replace(/\//g, "-");
}

function normalizeSymbol(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, "");
}

function normalizedKey(key: string) {
  return key.toLowerCase().replace(/[\s_()%／/\-]/g, "");
}

function pickValue(row: Record<string, unknown>, aliases: string[]) {
  for (const alias of aliases) if (row[alias] != null) return row[alias];
  const wanted = new Set(aliases.map(normalizedKey));
  for (const [key, value] of Object.entries(row)) if (wanted.has(normalizedKey(key))) return value;
  return undefined;
}

function unwrapRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
  if (!payload || typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;
  for (const key of ["data", "result", "rows", "items"]) {
    if (Array.isArray(obj[key])) return (obj[key] as unknown[]).filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
  }
  return [];
}

function parseTdccJson(payload: unknown, source: string): DistributionLevelRow[] {
  const rows = unwrapRows(payload);
  return rows.map((row) => ({
    reportDate: normalizeDate(pickValue(row, ["資料日期", "Date", "date", "ReportDate", "reportDate"])),
    symbol: normalizeSymbol(pickValue(row, ["證券代號", "SecuritiesCode", "Securities Code", "stock_id", "StockId", "symbol"])),
    level: String(pickValue(row, ["持股分級", "SecuritiesHoldingRange", "Securities Holding Range", "HoldingSharesLevel", "level"]) ?? "").trim(),
    people: numberValue(pickValue(row, ["人數", "NumberOfHolders", "Number of Holders", "people", "holders"])),
    shares: numberValue(pickValue(row, ["股數", "NumberOfShares", "Number of Shares/Units", "shares", "unit"])),
    percent: numberValue(pickValue(row, ["占集保庫存數比例%", "占集保庫存數比例", "PercentageOfCentrallyDepositedSecurities", "Percentage of Centrally Deposited Securities", "percent", "ratio"])),
    source,
  })).filter((row) => row.symbol && row.reportDate && row.level);
}

function parseTdccCsv(text: string, source: string): DistributionLevelRow[] {
  const parsed = parseCsv(text.replace(/^\uFEFF/, ""));
  if (parsed.length < 2) return [];
  const headers = parsed[0].map((value) => value.trim());
  const dateIndex = findColumn(headers, [/資料日期|日期|report.*date|^date$/i], 0);
  const symbolIndex = findColumn(headers, [/證券代號|股票代號|security.*code|stock.*id|symbol/i], 1);
  const levelIndex = findColumn(headers, [/持股分級|持股級距|holding.*range|holding.*level|level/i], 2);
  const peopleIndex = findColumn(headers, [/人數|people|holder/i], 3);
  const sharesIndex = findColumn(headers, [/股數|shares|unit/i], 4);
  const percentIndex = findColumn(headers, [/占集保庫存數比例|比例|percent|ratio/i], 5);
  return parsed.slice(1).map((cells) => ({
    reportDate: normalizeDate(cells[dateIndex]),
    symbol: normalizeSymbol(cells[symbolIndex]),
    level: String(cells[levelIndex] ?? "").trim(),
    people: numberValue(cells[peopleIndex]),
    shares: numberValue(cells[sharesIndex]),
    percent: numberValue(cells[percentIndex]),
    source,
  })).filter((row) => row.symbol && row.reportDate && row.level);
}

async function fetchTdccEndpoint(endpoint: string, source: string) {
  const response = await fetch(endpoint, {
    cache: "no-store",
    headers: { Accept: "application/json,text/csv,text/plain;q=0.9,*/*;q=0.8" },
  });
  if (!response.ok) throw new Error(`TDCC ${source} HTTP ${response.status}`);
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  if (/json/i.test(contentType) || /^[\s\uFEFF]*[\[{]/.test(text)) {
    try { return parseTdccJson(JSON.parse(text.replace(/^\uFEFF/, "")), source); }
    catch (error) { throw new Error(`TDCC ${source} JSON 解析失敗: ${error instanceof Error ? error.message : String(error)}`); }
  }
  return parseTdccCsv(text, source);
}

/**
 * M8.9.9: 股權分散只使用 TDCC 官方免費開放資料，不再呼叫 FinMind 的
 * TaiwanStockHoldingSharesPer（該資料集可能需要付費會員權限）。
 *
 * 先走 TDCC OpenAPI；若官方 OpenAPI 暫時不可用，再退回 TDCC 官方舊 CSV 下載介面。
 * 兩者皆屬 TDCC 開放資料來源，不增加 FinMind 付費需求。
 */
export async function fetchTdccDistribution(symbols?: string[]): Promise<DistributionLevelRow[]> {
  const openApi = process.env.TDCC_DISTRIBUTION_OPENAPI_URL || TDCC_OPENAPI;
  const legacy = process.env.TDCC_DISTRIBUTION_CSV_URL || TDCC_LEGACY_CSV;
  const wanted = symbols?.length ? new Set(symbols.map(normalizeSymbol)) : null;
  const errors: string[] = [];

  for (const [endpoint, source] of [[openApi, "tdcc:openapi:1-5"], [legacy, "tdcc:opendata-csv:1-5"]] as const) {
    try {
      const rows = await fetchTdccEndpoint(endpoint, source);
      const filtered = wanted ? rows.filter((row) => wanted.has(row.symbol)) : rows;
      if (filtered.length) return filtered;
      errors.push(`${source}: 回傳資料中找不到指定股票`);
    } catch (error) {
      errors.push(`${source}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`TDCC 股權分散同步失敗｜${errors.join("｜")}`);
}
