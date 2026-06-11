import { NextResponse } from 'next/server';

type Market = 'TWSE' | 'TPEX';

type MonthData = {
  market: Market;
  name: string;
  rows: any[];
};

type PriceRow = {
  date: string;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
};

type ForeignRecord = {
  date: string;
  buy: number | null;
  sell: number | null;
  net: number | null;
};

const CACHE_TTL = 1000 * 60 * 30;
const monthCache = new Map<string, { expiresAt: number; data: MonthData | null }>();
const nameCache = new Map<string, { expiresAt: number; name: string }>();

function parseDate(dateStr: string) {
  const normalized = dateStr.split('/').join('-');
  const [y, m, d] = normalized.split('-').map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

function toDateObject(y: number, m: number, d: number) {
  return new Date(Date.UTC(y, m - 1, d));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatTwseDate(date: Date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function formatRocDate(date: Date) {
  const y = date.getUTCFullYear() - 1911;
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}/${m}/${d}`;
}

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replaceAll(',', '').replaceAll(' ', '').trim();
  if (!cleaned || cleaned === '--' || cleaned === '---') return null;
  const num = Number(cleaned);
  return Number.isNaN(num) ? null : num;
}

function sharesToLots(value: number | null) {
  if (value === null) return null;
  return Number((value / 1000).toFixed(2));
}

function rocDateToNumber(dateStr: string) {
  const [rocY, m, d] = String(dateStr).split('/').map(Number);
  if (!rocY || !m || !d) return 0;
  return rocY * 10000 + m * 100 + d;
}

function dateToRocNumber(date: Date) {
  return (
    (date.getUTCFullYear() - 1911) * 10000 +
    (date.getUTCMonth() + 1) * 100 +
    date.getUTCDate()
  );
}

function previousMonth(y: number, m: number) {
  return m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
}

function monthList(startDate: Date, endDate: Date) {
  const result: { y: number; m: number }[] = [];
  let y = startDate.getUTCFullYear();
  let m = startDate.getUTCMonth() + 1;
  const endY = endDate.getUTCFullYear();
  const endM = endDate.getUTCMonth() + 1;

  while (y < endY || (y === endY && m <= endM)) {
    result.push({ y, m });
    if (m === 12) {
      y += 1;
      m = 1;
    } else {
      m += 1;
    }
  }

  return result;
}

async function fetchText(url: string) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'application/json,text/html,text/plain,*/*',
    },
    cache: 'no-store',
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return text;
}

async function fetchJson(url: string) {
  const text = await fetchText(url);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`JSON Parse Error: ${url}`);
  }
}

async function getStockName(symbol: string, market: Market) {
  const cacheKey = `${market}:${symbol}`;
  const cached = nameCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.name;

  let name = market === 'TWSE' ? '上市股票' : '上櫃股票';

  try {
    const prefix = market === 'TWSE' ? 'tse' : 'otc';
    const url =
      `https://mis.twse.com.tw/stock/api/getStockInfo.jsp` +
      `?ex_ch=${prefix}_${symbol}.tw&json=1&delay=0&_=${Date.now()}`;

    const result = await fetchJson(url);
    const apiName = result?.msgArray?.[0]?.n;

    if (typeof apiName === 'string' && apiName.trim()) {
      name = apiName.trim();
    }
  } catch {
    // 名稱失敗不影響主查詢
  }

  nameCache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL,
    name,
  });

  return name;
}

async function fetchTwseMonth(symbol: string, y: number, m: number, includeName = true): Promise<MonthData | null> {
  const date = `${y}${String(m).padStart(2, '0')}01`;
  const url =
    `https://www.twse.com.tw/exchangeReport/STOCK_DAY` +
    `?response=json&date=${date}&stockNo=${symbol}`;

  const result = await fetchJson(url);
  if (result.stat !== 'OK' || !Array.isArray(result.data)) return null;

  return {
    market: 'TWSE',
    name: includeName ? await getStockName(symbol, 'TWSE') : '上市股票',
    rows: result.data,
  };
}

async function fetchTpexMonth(symbol: string, y: number, m: number, includeName = true): Promise<MonthData | null> {
  const date = `${y}/${String(m).padStart(2, '0')}/01`;
  const url =
    `https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock` +
    `?code=${symbol}&date=${encodeURIComponent(date)}&response=json`;

  const result = await fetchJson(url);
  const rows = result?.tables?.[0]?.data || [];
  if (!Array.isArray(rows) || rows.length === 0) return null;

  return {
    market: 'TPEX',
    name: includeName ? await getStockName(symbol, 'TPEX') : '上櫃股票',
    rows,
  };
}

async function fetchMonth(symbol: string, y: number, m: number, knownMarket?: Market, includeName = true) {
  const cacheKey = `${knownMarket || 'AUTO'}:${symbol}:${y}-${String(m).padStart(2, '0')}:${includeName ? 'N' : 'X'}`;
  const cached = monthCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) return cached.data;

  let data: MonthData | null = null;

  if (knownMarket === 'TWSE') {
    data = await fetchTwseMonth(symbol, y, m, includeName).catch(() => null);
  } else if (knownMarket === 'TPEX') {
    data = await fetchTpexMonth(symbol, y, m, includeName).catch(() => null);
  } else {
    data =
      (await fetchTwseMonth(symbol, y, m, includeName).catch(() => null)) ||
      (await fetchTpexMonth(symbol, y, m, includeName).catch(() => null));
  }

  monthCache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL,
    data,
  });

  return data;
}

function rowToPriceRow(row: any[]): PriceRow {
  return {
    date: row[0],
    volume: parseNumber(row[1]),
    high: parseNumber(row[4]),
    low: parseNumber(row[5]),
    close: parseNumber(row[6]),
  };
}

async function fetchRowsForDays(symbol: string, market: Market, endDate: Date, days: number) {
  const startDate = addDays(endDate, -(days - 1));
  const startNum = dateToRocNumber(startDate);
  const endNum = dateToRocNumber(endDate);
  const months = monthList(startDate, endDate);

  const rows: PriceRow[] = [];

  // 故意用 for...of 降低瞬間併發，避免小電腦或 API 壓力過大。
  for (const item of months) {
    const monthData = await fetchMonth(symbol, item.y, item.m, market, false).catch(() => null);
    if (!monthData) continue;

    for (const row of monthData.rows) {
      const rowNum = rocDateToNumber(row[0]);
      if (rowNum >= startNum && rowNum <= endNum) {
        rows.push(rowToPriceRow(row));
      }
    }
  }

  return rows;
}

function calcHighLow(rows: PriceRow[]) {
  let highest: PriceRow | null = null;
  let lowest: PriceRow | null = null;

  for (const row of rows) {
    if (row.high !== null && (!highest || row.high > (highest.high ?? -Infinity))) {
      highest = row;
    }
    if (row.low !== null && (!lowest || row.low < (lowest.low ?? Infinity))) {
      lowest = row;
    }
  }

  return {
    highest: highest ? { date: highest.date, price: highest.high } : null,
    lowest: lowest ? { date: lowest.date, price: lowest.low } : null,
    tradingDays: rows.length,
  };
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function calcMovingAverages(rows: PriceRow[]) {
  const closes = rows.filter((row) => row.close !== null).map((row) => row.close as number);

  return {
    ma20: average(closes.slice(-20)),
    ma60: average(closes.slice(-60)),
    ma240: average(closes.slice(-240)),
  };
}

function calcVolumeCostZone(rows: PriceRow[]) {
  const validRows = rows.filter((row) => row.close !== null && row.volume !== null && row.volume > 0);

  if (validRows.length === 0) {
    return {
      price: null,
      rangeLow: null,
      rangeHigh: null,
      totalVolume: null,
      note: '成交量成本區以近360日成交量加權平均價估算。',
    };
  }

  let totalAmount = 0;
  let totalVolume = 0;

  for (const row of validRows) {
    totalAmount += (row.close as number) * (row.volume as number);
    totalVolume += row.volume as number;
  }

  const cost = totalVolume > 0 ? totalAmount / totalVolume : null;

  return {
    price: cost === null ? null : Number(cost.toFixed(2)),
    rangeLow: cost === null ? null : Number((cost * 0.97).toFixed(2)),
    rangeHigh: cost === null ? null : Number((cost * 1.03).toFixed(2)),
    totalVolume,
    note: '成交量成本區以近360日成交量加權平均價估算，區間為成本價上下3%。',
  };
}

function calcFibonacci(range360: ReturnType<typeof calcHighLow>) {
  const high = range360.highest?.price ?? null;
  const low = range360.lowest?.price ?? null;

  if (high === null || low === null || high <= low) {
    return { high, low, levels: [] };
  }

  const diff = high - low;

  return {
    high,
    low,
    levels: [
      { label: '23.6%', price: Number((high - diff * 0.236).toFixed(2)) },
      { label: '38.2%', price: Number((high - diff * 0.382).toFixed(2)) },
      { label: '50.0%', price: Number((high - diff * 0.5).toFixed(2)) },
      { label: '61.8%', price: Number((high - diff * 0.618).toFixed(2)) },
      { label: '78.6%', price: Number((high - diff * 0.786).toFixed(2)) },
    ],
    note: 'Fibonacci 以近360日高低點計算回檔支撐區。',
  };
}

function percentDistance(current: number | null, target: number | null) {
  if (current === null || target === null || current === 0) return null;
  return Number((((target - current) / current) * 100).toFixed(2));
}

function calcSupportResistance(close: number | null, rangeStats: any) {
  const items = [
    { label: '30日', support: rangeStats.last30Days?.lowest || null, resistance: rangeStats.last30Days?.highest || null },
    { label: '60日', support: rangeStats.last60Days?.lowest || null, resistance: rangeStats.last60Days?.highest || null },
    { label: '360日', support: rangeStats.last360Days?.lowest || null, resistance: rangeStats.last360Days?.highest || null },
  ].map((item) => ({
    ...item,
    supportDistancePercent: percentDistance(close, item.support?.price ?? null),
    resistanceDistancePercent: percentDistance(close, item.resistance?.price ?? null),
  }));

  let status = '中段震盪';
  const support30Pct = items[0].supportDistancePercent;
  const resistance30Pct = items[0].resistanceDistancePercent;

  if (support30Pct !== null && Math.abs(support30Pct) <= 3) status = '接近30日支撐';
  else if (resistance30Pct !== null && Math.abs(resistance30Pct) <= 3) status = '接近30日壓力';

  return {
    status,
    items,
    note: '支撐以區間最低價估算，壓力以區間最高價估算，百分比為距離目前收盤價。',
  };
}

function scoreNearLevel(close: number | null, level: number | null, tolerancePercent: number) {
  if (close === null || level === null || close === 0) return 0;
  const distance = Math.abs(((close - level) / close) * 100);
  if (distance > tolerancePercent) return 0;
  return Math.max(0, Math.round(100 - (distance / tolerancePercent) * 100));
}

function calcSupportStrengthScore(close: number | null, rangeStats: any, movingAverages: any, volumeCostZone: any, fibonacci: any) {
  let score = 0;
  const reasons: string[] = [];

  const supports = [
    { label: '30日低點', price: rangeStats.last30Days.lowest?.price ?? null, weight: 18 },
    { label: '60日低點', price: rangeStats.last60Days.lowest?.price ?? null, weight: 18 },
    { label: '360日低點', price: rangeStats.last360Days.lowest?.price ?? null, weight: 14 },
    { label: '20MA', price: movingAverages.ma20, weight: 12 },
    { label: '60MA', price: movingAverages.ma60, weight: 12 },
    { label: '240MA', price: movingAverages.ma240, weight: 10 },
    { label: '成交量成本區', price: volumeCostZone.price, weight: 10 },
  ];

  for (const item of supports) {
    const nearScore = scoreNearLevel(close, item.price, 5);
    if (nearScore > 0) {
      const add = Math.round((nearScore / 100) * item.weight);
      score += add;
      reasons.push(`${item.label}接近目前價格`);
    }
  }

  for (const level of fibonacci.levels || []) {
    const nearScore = scoreNearLevel(close, level.price, 5);
    if (nearScore > 0) {
      const add = Math.round((nearScore / 100) * 6);
      score += add;
      reasons.push(`Fibonacci ${level.label}接近目前價格`);
    }
  }

  score = Math.min(100, score);

  let rating = '弱';
  if (score >= 75) rating = '強';
  else if (score >= 50) rating = '中強';
  else if (score >= 30) rating = '普通';

  return {
    score,
    rating,
    reasons,
    note: '分數根據目前收盤價是否接近區間低點、均線、成交量成本區與 Fibonacci 支撐位估算。',
  };
}

async function calcAdvancedStats(symbol: string, market: Market, y: number, m: number, d: number, close: number | null) {
  const endDate = toDateObject(y, m, d);

  // 只抓一次 360 日資料，30 / 60 / 240MA / Fibonacci 全部都從這份資料切出來，減少 API 與記憶體負擔。
  const rows360 = await fetchRowsForDays(symbol, market, endDate, 360);
  const endNum = dateToRocNumber(endDate);

  const rows30 = rows360.filter((row) => row.date && rocDateToNumber(row.date) >= dateToRocNumber(addDays(endDate, -29)) && rocDateToNumber(row.date) <= endNum);
  const rows60 = rows360.filter((row) => row.date && rocDateToNumber(row.date) >= dateToRocNumber(addDays(endDate, -59)) && rocDateToNumber(row.date) <= endNum);

  const rangeStats = {
    last30Days: calcHighLow(rows30),
    last60Days: calcHighLow(rows60),
    last360Days: calcHighLow(rows360),
  };

  const movingAverages = calcMovingAverages(rows360);
  const volumeCostZone = calcVolumeCostZone(rows360);
  const fibonacci = calcFibonacci(rangeStats.last360Days);
  const supportResistance = calcSupportResistance(close, rangeStats);
  const supportStrength = calcSupportStrengthScore(close, rangeStats, movingAverages, volumeCostZone, fibonacci);

  return {
    ...rangeStats,
    movingAverages,
    volumeCostZone,
    fibonacci,
    supportResistance,
    supportStrength,
    rowsUsed: {
      last30: rows30.length,
      last60: rows60.length,
      last360: rows360.length,
    },
  };
}

async function fetchTwseForeignOneDay(symbol: string, date: Date): Promise<ForeignRecord | null> {
  const url =
    `https://www.twse.com.tw/rwd/zh/fund/T86` +
    `?date=${formatTwseDate(date)}&selectType=ALLBUT0999&response=json`;

  const result = await fetchJson(url);
  const rows = result?.data || [];
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const row = rows.find((item: any[]) => String(item?.[0]).trim() === symbol);
  if (!row) return null;

  return {
    date: formatRocDate(date),
    buy: sharesToLots(parseNumber(row[2])),
    sell: sharesToLots(parseNumber(row[3])),
    net: sharesToLots(parseNumber(row[4])),
  };
}

function parseTpexForeignRow(symbol: string, row: any[]): Omit<ForeignRecord, 'date'> | null {
  if (!Array.isArray(row)) return null;
  const codeIndex = row.findIndex((value) => String(value).trim() === symbol);
  if (codeIndex < 0) return null;

  const buyShares = parseNumber(row[codeIndex + 2]);
  const sellShares = parseNumber(row[codeIndex + 3]);
  const netShares = parseNumber(row[codeIndex + 4]);

  if (buyShares === null && sellShares === null && netShares === null) return null;

  return {
    buy: sharesToLots(buyShares),
    sell: sharesToLots(sellShares),
    net: sharesToLots(netShares),
  };
}

function stripHtmlTags(text: string) {
  return text
    .replace(new RegExp('<[^>]*>', 'g'), ' ')
    .replace(new RegExp('&nbsp;', 'g'), ' ')
    .replace(new RegExp('\\\\s+', 'g'), ' ')
    .trim();
}

function parseTpexForeignHtml(symbol: string, html: string): Omit<ForeignRecord, 'date'> | null {
  const plain = stripHtmlTags(html);
  const index = plain.indexOf(symbol);
  if (index < 0) return null;

  const snippet = plain.slice(index, index + 300);
  const parts = snippet.split(' ').filter(Boolean);
  const codeIndex = parts.findIndex((value) => value === symbol);
  if (codeIndex < 0) return null;

  const row = parts.slice(codeIndex, codeIndex + 8);
  return parseTpexForeignRow(symbol, row);
}

async function fetchTpexForeignOneDay(symbol: string, date: Date): Promise<ForeignRecord | null> {
  const rocDate = formatRocDate(date);

  const urls = [
    `https://www.tpex.org.tw/web/stock/3insti/daily_trade/3itrade_hedge_result.php?l=zh-tw&o=json&se=EW&t=D&d=${encodeURIComponent(rocDate)}&s=0,asc,0`,
    `https://www.tpex.org.tw/web/stock/3insti/daily_trade/3itrade_hedge_result.php?l=zh-tw&o=htm&se=EW&t=D&d=${encodeURIComponent(rocDate)}&s=0,asc,0`,
  ];

  for (const url of urls) {
    try {
      const text = await fetchText(url);

      try {
        const result = JSON.parse(text);
        const rows = result?.aaData || result?.data || result?.tables?.[0]?.data || [];
        if (Array.isArray(rows)) {
          for (const row of rows) {
            const parsed = parseTpexForeignRow(symbol, row);
            if (parsed) return { date: rocDate, ...parsed };
          }
        }
      } catch {
        const parsed = parseTpexForeignHtml(symbol, text);
        if (parsed) return { date: rocDate, ...parsed };
      }
    } catch {
      // continue
    }
  }

  return null;
}

async function fetchForeign10Days(symbol: string, market: Market, y: number, m: number, d: number) {
  const result: ForeignRecord[] = [];
  let cursor = toDateObject(y, m, d);

  // 降低上限：最多往前 25 天，避免外資 API 呼叫過多造成卡頓。
  for (let i = 0; i < 25 && result.length < 10; i++) {
    try {
      const item =
        market === 'TWSE'
          ? await fetchTwseForeignOneDay(symbol, cursor)
          : await fetchTpexForeignOneDay(symbol, cursor);

      if (item) result.push(item);
    } catch {
      // skip
    }

    cursor = addDays(cursor, -1);
  }

  return result;
}

function emptyAdvancedStats(close: number | null) {
  const emptyRange = {
    last30Days: calcHighLow([]),
    last60Days: calcHighLow([]),
    last360Days: calcHighLow([]),
  };

  const movingAverages = { ma20: null, ma60: null, ma240: null };
  const volumeCostZone = calcVolumeCostZone([]);
  const fibonacci = calcFibonacci(emptyRange.last360Days);
  const supportResistance = calcSupportResistance(close, emptyRange);
  const supportStrength = calcSupportStrengthScore(close, emptyRange, movingAverages, volumeCostZone, fibonacci);

  return {
    ...emptyRange,
    movingAverages,
    volumeCostZone,
    fibonacci,
    supportResistance,
    supportStrength,
    rowsUsed: {
      last30: 0,
      last60: 0,
      last360: 0,
    },
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const symbol = (searchParams.get('symbol') || '3491').trim();
    const targetDate = searchParams.get('date') || new Date().toISOString().slice(0, 10);

    const includeAdvanced = searchParams.get('advanced') !== '0';
    const includeForeign = searchParams.get('foreign') === '1';

    if (!/^\d{4,6}$/.test(symbol)) {
      return NextResponse.json({ error: '股票代號格式錯誤' }, { status: 400 });
    }

    const parsed = parseDate(targetDate);
    if (!parsed) {
      return NextResponse.json({ error: '日期格式錯誤' }, { status: 400 });
    }

    const { y, m, d } = parsed;
    const targetNumber = (y - 1911) * 10000 + m * 100 + d;

    let data = await fetchMonth(symbol, y, m);
    let targetRow: any[] | null = null;

    if (data) {
      for (let i = data.rows.length - 1; i >= 0; i--) {
        const rowNumber = rocDateToNumber(data.rows[i][0]);
        if (rowNumber <= targetNumber) {
          targetRow = data.rows[i];
          break;
        }
      }
    }

    if (!targetRow) {
      const prev = previousMonth(y, m);
      data = await fetchMonth(symbol, prev.y, prev.m);

      if (data && data.rows.length > 0) {
        targetRow = data.rows[data.rows.length - 1];
      }
    }

    if (!data || !targetRow) {
      return NextResponse.json({ error: '找不到交易資料' }, { status: 404 });
    }

    const close = parseNumber(targetRow[6]);

    const [advancedResult, foreignResult] = await Promise.allSettled([
      includeAdvanced
        ? calcAdvancedStats(symbol, data.market, y, m, d, close)
        : Promise.resolve(emptyAdvancedStats(close)),
      includeForeign
        ? fetchForeign10Days(symbol, data.market, y, m, d)
        : Promise.resolve([]),
    ]);

    const rangeStats =
      advancedResult.status === 'fulfilled' ? advancedResult.value : emptyAdvancedStats(close);

    const foreign10Days =
      foreignResult.status === 'fulfilled' ? foreignResult.value : [];

    return NextResponse.json({
      symbol,
      name: data.name,
      market: data.market,
      date: targetRow[0],
      volume: parseNumber(targetRow[1]),
      open: parseNumber(targetRow[3]),
      max: parseNumber(targetRow[4]),
      min: parseNumber(targetRow[5]),
      close,
      rangeStats,
      foreign10Days,
      foreign10DaysUnit: '張',
      foreign10DaysDescription: includeForeign
        ? '外資買進、賣出與買賣超，最近 10 個有資料的交易日'
        : '外資資料已關閉，可於畫面打開。',
      meta: {
        cacheTtlMinutes: CACHE_TTL / 1000 / 60,
        advancedEnabled: includeAdvanced,
        foreignEnabled: includeForeign,
        lightMode: !includeAdvanced && !includeForeign,
      },
    });
  } catch (error: any) {
    console.error(error);

    return NextResponse.json(
      {
        error: '查詢失敗',
        detail: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
