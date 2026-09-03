const REQUEST_TIMEOUT_MS = 25_000;

export type PublicMarginRow = {
  symbol: string;
  tradeDate: string;
  marginPrevBalance: number | null;
  marginBuy: number | null;
  marginSell: number | null;
  marginCashRepay: number | null;
  marginBalance: number | null;
  marginUtilizationPct: number | null;
  shortPrevBalance: number | null;
  shortSell: number | null;
  shortBuy: number | null;
  shortRepay: number | null;
  shortBalance: number | null;
  source: string;
};

export type PublicDaytradeRow = {
  symbol: string;
  tradeDate: string;
  daytradeVolume: number | null;
  daytradeBuyValue: number | null;
  daytradeSellValue: number | null;
  source: string;
};

export type PublicMarketIndexRow = {
  indexCode: string;
  displayName: string;
  tradeDate: string;
  close: number | null;
  changePct: number | null;
  source: string;
};

export type PublicRiskSnapshot = {
  tradeDate: string;
  marginRows: PublicMarginRow[];
  daytradeRows: PublicDaytradeRow[];
  indexRows: PublicMarketIndexRow[];
  externalRequests: number;
  successfulRequests: number;
  errors: string[];
  sources: Record<string, string>;
};

type TableCandidate = { title: string; fields: string[]; data: unknown[][] };

function cleanText(value: unknown) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|\u00a0/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .trim();
}

function normalized(value: unknown) {
  return cleanText(value).replace(/[\s（）()％%]/g, "").replace(/臺/g, "台");
}

function numberOrNull(value: unknown): number | null {
  const text = cleanText(value)
    .replace(/,/g, "")
    .replace(/[＋+]/g, "")
    .replace(/[%％]/g, "")
    .trim();
  if (!text || ["--", "---", "X", "N/A", "null"].includes(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function symbolValue(value: unknown): string | null {
  const valueText = cleanText(value).replace(/[^0-9A-Za-z]/g, "");
  return /^\d{4,6}$/.test(valueText) ? valueText : null;
}

function yyyymmdd(date: string) {
  return date.replaceAll("-", "");
}

function rocDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return `${year - 1911}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 twstock-M8.10.25",
        Accept: "application/json,text/plain,*/*",
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${new URL(url).hostname}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function tableCandidates(payload: unknown): TableCandidate[] {
  if (!payload || typeof payload !== "object") return [];
  const p = payload as Record<string, unknown>;
  const out: TableCandidate[] = [];
  const push = (item: Record<string, unknown>, fallbackTitle = "") => {
    const fields = Array.isArray(item.fields)
      ? item.fields.map(cleanText)
      : Array.isArray(item.columns)
        ? item.columns.map(cleanText)
        : [];
    const dataRaw = Array.isArray(item.data)
      ? item.data
      : Array.isArray(item.aaData)
        ? item.aaData
        : Array.isArray(item.rows)
          ? item.rows
          : [];
    const data = dataRaw.filter(Array.isArray) as unknown[][];
    if (data.length) out.push({ title: cleanText(item.title ?? fallbackTitle), fields, data });
  };

  if (Array.isArray(p.tables)) {
    for (const item of p.tables) {
      if (item && typeof item === "object") push(item as Record<string, unknown>);
    }
  }
  push(p);
  return out;
}

function fieldIndex(fields: string[], aliases: string[]): number {
  const wanted = aliases.map(normalized);
  return fields.findIndex((field) => {
    const f = normalized(field);
    return wanted.some((candidate) => f.includes(candidate));
  });
}

function allFieldIndices(fields: string[], aliases: string[]): number[] {
  const wanted = aliases.map(normalized);
  const out: number[] = [];
  fields.forEach((field, index) => {
    const f = normalized(field);
    if (wanted.some((candidate) => f.includes(candidate))) out.push(index);
  });
  return out;
}

function at(row: unknown[], index: number) {
  return index >= 0 && index < row.length ? row[index] : null;
}

function firstNumber(row: unknown[], indices: number[]) {
  for (const index of indices) {
    const value = numberOrNull(at(row, index));
    if (value != null) return value;
  }
  return null;
}

function chooseDuplicateAfter(indices: number[], pivot: number, ordinal = 0) {
  const after = indices.filter((index) => index > pivot);
  return after[ordinal] ?? indices[ordinal] ?? -1;
}

/** Parse listed-stock margin balance from TWSE MI_MARGN. */
export function parseTwseMargin(payload: unknown, tradeDate: string): PublicMarginRow[] {
  const tables = tableCandidates(payload);
  const table = tables.find((candidate) => {
    const code = fieldIndex(candidate.fields, ["證券代號", "股票代號"]);
    return code >= 0 && candidate.fields.some((field) => /融資|資買|資餘額/.test(cleanText(field)));
  });
  if (!table) return [];

  const fields = table.fields;
  const code = fieldIndex(fields, ["證券代號", "股票代號", "代號"]);
  const marginBuy = fieldIndex(fields, ["融資買進", "資買"]);
  const marginSell = fieldIndex(fields, ["融資賣出", "資賣"]);
  const marginCashRepay = fieldIndex(fields, ["現金償還", "現償"]);
  const shortSell = fieldIndex(fields, ["融券賣出", "券賣"]);
  const shortBuy = fieldIndex(fields, ["融券買進", "券買"]);
  const shortRepay = fieldIndex(fields, ["現券償還", "券償"]);

  const prevIndices = allFieldIndices(fields, ["前日餘額", "前餘額"]);
  const balanceIndices = allFieldIndices(fields, ["今日餘額", "餘額"])
    .filter((index) => !/前日|前資|前券/.test(cleanText(fields[index])));

  const marginPrev = fieldIndex(fields, ["融資前日餘額", "前資餘額"]);
  const shortPrev = fieldIndex(fields, ["融券前日餘額", "前券餘額"]);
  const marginBalance = fieldIndex(fields, ["融資今日餘額", "融資餘額", "資餘額"]);
  const shortBalance = fieldIndex(fields, ["融券今日餘額", "融券餘額", "券餘額"]);
  const marginUtilization = fieldIndex(fields, ["融資使用率", "資使用率"]);

  return table.data.flatMap((row) => {
    const symbol = symbolValue(at(row, code));
    if (!symbol) return [];

    const resolvedMarginPrev = firstNumber(row, [
      marginPrev,
      chooseDuplicateAfter(prevIndices, code, 0),
    ]);
    const resolvedShortPrev = firstNumber(row, [
      shortPrev,
      chooseDuplicateAfter(prevIndices, Math.max(shortSell, shortBuy, shortRepay), 0),
      prevIndices[1] ?? -1,
    ]);
    const resolvedMarginBalance = firstNumber(row, [
      marginBalance,
      chooseDuplicateAfter(balanceIndices, Math.max(marginBuy, marginSell, marginCashRepay), 0),
      balanceIndices[0] ?? -1,
    ]);
    const resolvedShortBalance = firstNumber(row, [
      shortBalance,
      chooseDuplicateAfter(balanceIndices, Math.max(shortSell, shortBuy, shortRepay), 0),
      balanceIndices[1] ?? -1,
    ]);

    return [{
      symbol,
      tradeDate,
      marginPrevBalance: resolvedMarginPrev,
      marginBuy: numberOrNull(at(row, marginBuy)),
      marginSell: numberOrNull(at(row, marginSell)),
      marginCashRepay: numberOrNull(at(row, marginCashRepay)),
      marginBalance: resolvedMarginBalance,
      marginUtilizationPct: numberOrNull(at(row, marginUtilization)),
      shortPrevBalance: resolvedShortPrev,
      shortSell: numberOrNull(at(row, shortSell)),
      shortBuy: numberOrNull(at(row, shortBuy)),
      shortRepay: numberOrNull(at(row, shortRepay)),
      shortBalance: resolvedShortBalance,
      source: "twse:MI_MARGN",
    }];
  });
}

/** Parse OTC margin balance from the TPEx margin balance report. */
export function parseTpexMargin(payload: unknown, tradeDate: string): PublicMarginRow[] {
  const tables = tableCandidates(payload);
  const table = tables.find((candidate) => candidate.data.some((row) => Boolean(symbolValue(row[0]))));
  if (!table) return [];
  const fields = table.fields;
  const idx = (aliases: string[], fallback = -1) => fields.length ? fieldIndex(fields, aliases) : fallback;

  const code = idx(["代號", "證券代號"], 0);
  const marginPrev = idx(["前資餘額"], 2);
  const marginBuy = idx(["資買"], 3);
  const marginSell = idx(["資賣"], 4);
  const marginCashRepay = idx(["現償"], 5);
  const marginBalance = idx(["資餘額"], 6);
  const marginUtilization = idx(["資使用率"], 8);
  const shortPrev = idx(["前券餘額"], 10);
  const shortSell = idx(["券賣"], 11);
  const shortBuy = idx(["券買"], 12);
  const shortRepay = idx(["券償"], 13);
  const shortBalance = idx(["券餘額"], 14);

  return table.data.flatMap((row) => {
    const symbol = symbolValue(at(row, Math.max(0, code)));
    if (!symbol) return [];
    return [{
      symbol,
      tradeDate,
      marginPrevBalance: numberOrNull(at(row, marginPrev)),
      marginBuy: numberOrNull(at(row, marginBuy)),
      marginSell: numberOrNull(at(row, marginSell)),
      marginCashRepay: numberOrNull(at(row, marginCashRepay)),
      marginBalance: numberOrNull(at(row, marginBalance)),
      marginUtilizationPct: numberOrNull(at(row, marginUtilization)),
      shortPrevBalance: numberOrNull(at(row, shortPrev)),
      shortSell: numberOrNull(at(row, shortSell)),
      shortBuy: numberOrNull(at(row, shortBuy)),
      shortRepay: numberOrNull(at(row, shortRepay)),
      shortBalance: numberOrNull(at(row, shortBalance)),
      source: "tpex:margin_balance",
    }];
  });
}

function parseDaytradeTable(payload: unknown, tradeDate: string, source: string): PublicDaytradeRow[] {
  const tables = tableCandidates(payload);
  const table = tables.find((candidate) => {
    const code = fieldIndex(candidate.fields, ["證券代號", "股票代號", "代號"]);
    return code >= 0 && candidate.fields.some((field) => /當日沖銷|當沖/.test(cleanText(field)));
  }) ?? tables.find((candidate) => candidate.data.some((row) => Boolean(symbolValue(row[0]))) && candidate.fields.some((field) => /當沖|沖銷/.test(cleanText(field))));
  if (!table) return [];

  const fields = table.fields;
  const code = fields.length ? fieldIndex(fields, ["證券代號", "股票代號", "代號"]) : 0;
  const volume = fields.length ? fieldIndex(fields, ["當日沖銷交易成交股數", "當沖成交股數", "當沖成交量", "當沖量"]) : 3;
  const buyValue = fields.length ? fieldIndex(fields, ["當日沖銷交易買進成交金額", "當沖買進成交金額", "買進成交金額"]) : 4;
  const sellValue = fields.length ? fieldIndex(fields, ["當日沖銷交易賣出成交金額", "當沖賣出成交金額", "賣出成交金額"]) : 5;

  return table.data.flatMap((row) => {
    const symbol = symbolValue(at(row, Math.max(0, code)));
    if (!symbol) return [];
    return [{
      symbol,
      tradeDate,
      daytradeVolume: numberOrNull(at(row, volume)),
      daytradeBuyValue: numberOrNull(at(row, buyValue)),
      daytradeSellValue: numberOrNull(at(row, sellValue)),
      source,
    }];
  });
}

export function parseTwseDaytrade(payload: unknown, tradeDate: string) {
  return parseDaytradeTable(payload, tradeDate, "twse:TWTB4U");
}

export function parseTpexDaytrade(payload: unknown, tradeDate: string) {
  return parseDaytradeTable(payload, tradeDate, "tpex:intraday_stat");
}

/** Extract TAIEX close from the same TWSE MI_INDEX payload used by the core Bulk engine. */
export function parseTwseTaiex(payload: unknown, tradeDate: string): PublicMarketIndexRow[] {
  const tables = tableCandidates(payload);
  for (const table of tables) {
    const row = table.data.find((candidate) => cleanText(candidate[0]).includes("發行量加權股價指數"));
    if (!row) continue;
    const closeIndex = fieldIndex(table.fields, ["收盤指數", "收盤"]);
    const changePctIndex = fieldIndex(table.fields, ["漲跌百分比", "漲跌幅"]);
    const close = numberOrNull(at(row, closeIndex >= 0 ? closeIndex : 1));
    const changePct = numberOrNull(at(row, changePctIndex));
    return [{
      indexCode: "TAIEX",
      displayName: "發行量加權股價指數",
      tradeDate,
      close,
      changePct,
      source: "twse:MI_INDEX",
    }];
  }
  return [];
}

function uniqueBySymbol<T extends { symbol: string }>(rows: T[]) {
  const map = new Map<string, T>();
  for (const row of rows) map.set(row.symbol, row);
  return [...map.values()];
}

/**
 * Five free/public official requests at most:
 * 1) TWSE margin, 2) TPEx margin, 3) TWSE per-security day trading,
 * 4) TPEx day-trading report, 5) TWSE MI_INDEX (TAIEX).
 *
 * Every endpoint is best-effort. Missing risk data never blocks the core market
 * pipeline or calls a paid fallback provider.
 */
export async function fetchPublicRiskSnapshot(tradeDate: string): Promise<PublicRiskSnapshot> {
  const twseDate = yyyymmdd(tradeDate);
  const otcDate = encodeURIComponent(rocDate(tradeDate));
  const requests = [
    {
      key: "twseMargin",
      url: `https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date=${twseDate}&selectType=STOCK&response=json`,
      parse: (payload: unknown) => ({ margin: parseTwseMargin(payload, tradeDate), daytrade: [] as PublicDaytradeRow[], index: [] as PublicMarketIndexRow[] }),
    },
    {
      key: "tpexMargin",
      url: `https://www.tpex.org.tw/web/stock/margin_trading/margin_balance/margin_bal_result.php?l=zh-tw&o=json&d=${otcDate}&s=0,asc`,
      parse: (payload: unknown) => ({ margin: parseTpexMargin(payload, tradeDate), daytrade: [] as PublicDaytradeRow[], index: [] as PublicMarketIndexRow[] }),
    },
    {
      key: "twseDaytrade",
      url: `https://www.twse.com.tw/rwd/zh/dayTrading/TWTB4U?date=${twseDate}&response=json&selectType=All`,
      parse: (payload: unknown) => ({ margin: [] as PublicMarginRow[], daytrade: parseTwseDaytrade(payload, tradeDate), index: [] as PublicMarketIndexRow[] }),
    },
    {
      key: "tpexDaytrade",
      url: `https://www.tpex.org.tw/web/stock/trading/intraday_stat/intraday_trading_stat_result.php?l=zh-tw&t=D&o=json&d=${otcDate}&s=0,asc,0`,
      parse: (payload: unknown) => ({ margin: [] as PublicMarginRow[], daytrade: parseTpexDaytrade(payload, tradeDate), index: [] as PublicMarketIndexRow[] }),
    },
    {
      key: "taiex",
      url: `https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date=${twseDate}&type=ALLBUT0999&response=json`,
      parse: (payload: unknown) => ({ margin: [] as PublicMarginRow[], daytrade: [] as PublicDaytradeRow[], index: parseTwseTaiex(payload, tradeDate) }),
    },
  ] as const;

  const settled = await Promise.allSettled(requests.map(async (request) => {
    const payload = await fetchJson(request.url);
    return { request, parsed: request.parse(payload) };
  }));

  const marginRows: PublicMarginRow[] = [];
  const daytradeRows: PublicDaytradeRow[] = [];
  const indexRows: PublicMarketIndexRow[] = [];
  const errors: string[] = [];
  const sources: Record<string, string> = {};
  let successfulRequests = 0;

  settled.forEach((result, index) => {
    const request = requests[index];
    sources[request.key] = request.url;
    if (result.status === "fulfilled") {
      successfulRequests += 1;
      marginRows.push(...result.value.parsed.margin);
      daytradeRows.push(...result.value.parsed.daytrade);
      indexRows.push(...result.value.parsed.index);
    } else {
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
      errors.push(`${request.key}: ${message}`);
    }
  });

  return {
    tradeDate,
    marginRows: uniqueBySymbol(marginRows),
    daytradeRows: uniqueBySymbol(daytradeRows),
    indexRows,
    externalRequests: requests.length,
    successfulRequests,
    errors,
    sources,
  };
}
