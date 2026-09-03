import { randomUUID } from "node:crypto";
import type { DatabaseAdapter, DatabaseRow, DatabaseStatement } from "@/lib/database";
import { refreshForeignAccumulationBulk } from "@/lib/foreign-accumulation";

const FINMIND_API = "https://api.finmindtrade.com/api/v4/data";
const REQUEST_TIMEOUT_MS = 25_000;
const ENGINE_VERSION = "M8.10.20";
const CHUNK_SIZE = 350;
const SNAPSHOT_LEASE_MS = 4 * 60_000;

type PriceSnapshotRow = {
  symbol: string;
  tradeDate: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  turnover: number | null;
  source: string;
};

type InstitutionalSnapshotRow = {
  symbol: string;
  tradeDate: string;
  foreignBuy: number;
  foreignSell: number;
  foreignNet: number;
  trustNet: number;
  dealerNet: number;
  source: string;
};

type BulkSnapshotRunRow = DatabaseRow & {
  trade_date: string;
  status: string;
  price_source: string | null;
  institutional_source: string | null;
  price_rows: number;
  institutional_rows: number;
  accumulation_rows: number;
  allowed_symbols: number;
  external_requests: number;
  finmind_requests: number;
  official_requests: number;
  updated_at: string;
  last_error: string | null;
  next_retry_at: string | null;
};

export type BulkSnapshotResult = {
  ready: boolean;
  cached: boolean;
  tradeDate: string;
  status: string;
  priceSource: string | null;
  institutionalSource: string | null;
  priceRows: number;
  institutionalRows: number;
  accumulationRows: number;
  allowedSymbols: number;
  externalRequests: number;
  finmindRequests: number;
  officialRequests: number;
  lastError: string | null;
  nextRetryAt: string | null;
};

function cleanText(value: unknown) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|\u00a0/g, " ")
    .trim();
}

function numberOrNull(value: unknown): number | null {
  const text = cleanText(value).replace(/,/g, "").replace(/[＋+]/g, "").trim();
  if (!text || text === "--" || text === "---" || text === "X") return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberValue(value: unknown): number {
  return numberOrNull(value) ?? 0;
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
        "User-Agent": "Mozilla/5.0 twstock-M8.10.20",
        Accept: "application/json,text/plain,*/*",
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${new URL(url).hostname}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function tableCandidates(payload: unknown): Array<{ title: string; fields: string[]; data: unknown[][] }> {
  if (!payload || typeof payload !== "object") return [];
  const p = payload as Record<string, unknown>;
  const out: Array<{ title: string; fields: string[]; data: unknown[][] }> = [];
  const push = (item: Record<string, unknown>, fallbackTitle = "") => {
    const fields = Array.isArray(item.fields) ? item.fields.map(cleanText) : [];
    const dataRaw = Array.isArray(item.data) ? item.data : Array.isArray(item.aaData) ? item.aaData : [];
    const data = dataRaw.filter(Array.isArray) as unknown[][];
    if (data.length) out.push({ title: cleanText(item.title ?? fallbackTitle), fields, data });
  };
  if (Array.isArray(p.tables)) {
    for (const item of p.tables) if (item && typeof item === "object") push(item as Record<string, unknown>);
  }
  push(p);
  return out;
}

function fieldIndex(fields: string[], tests: Array<string | RegExp>): number {
  for (let i = 0; i < fields.length; i += 1) {
    const value = fields[i].replace(/\s+/g, "");
    if (tests.some((test) => typeof test === "string" ? value.includes(test) : test.test(value))) return i;
  }
  return -1;
}

function parseTwsePrices(payload: unknown, tradeDate: string): PriceSnapshotRow[] {
  const tables = tableCandidates(payload);
  const table = tables.find((candidate) => {
    const code = fieldIndex(candidate.fields, ["證券代號"]);
    const close = fieldIndex(candidate.fields, ["收盤價"]);
    const open = fieldIndex(candidate.fields, ["開盤價"]);
    return code >= 0 && close >= 0 && open >= 0;
  });
  if (!table) return [];
  const code = fieldIndex(table.fields, ["證券代號"]);
  const open = fieldIndex(table.fields, ["開盤價"]);
  const high = fieldIndex(table.fields, ["最高價"]);
  const low = fieldIndex(table.fields, ["最低價"]);
  const close = fieldIndex(table.fields, ["收盤價"]);
  const volume = fieldIndex(table.fields, ["成交股數"]);
  const turnover = fieldIndex(table.fields, ["成交金額"]);
  return table.data.flatMap((row) => {
    const symbol = symbolValue(row[code]);
    if (!symbol) return [];
    return [{
      symbol, tradeDate,
      open: numberOrNull(row[open]), high: numberOrNull(row[high]), low: numberOrNull(row[low]), close: numberOrNull(row[close]),
      volume: numberOrNull(row[volume]), turnover: numberOrNull(row[turnover]), source: "twse:MI_INDEX",
    }];
  });
}

function parseTpexPrices(payload: unknown, tradeDate: string): PriceSnapshotRow[] {
  const tables = tableCandidates(payload);
  const table = tables.find((candidate) => candidate.data.some((row) => Boolean(symbolValue(row[0]))));
  if (!table) return [];
  const fields = table.fields;
  const code = fields.length ? fieldIndex(fields, ["代號", "證券代號"]) : 0;
  const close = fields.length ? fieldIndex(fields, ["收盤", "收盤價"]) : 2;
  const open = fields.length ? fieldIndex(fields, ["開盤", "開盤價"]) : 4;
  const high = fields.length ? fieldIndex(fields, ["最高", "最高價"]) : 5;
  const low = fields.length ? fieldIndex(fields, ["最低", "最低價"]) : 6;
  const volume = fields.length ? fieldIndex(fields, ["成交股數", "成交量"]) : 8;
  const turnover = fields.length ? fieldIndex(fields, ["成交金額", "成交值"]) : 9;
  return table.data.flatMap((row) => {
    const symbol = symbolValue(row[Math.max(0, code)]);
    if (!symbol) return [];
    return [{
      symbol, tradeDate,
      open: numberOrNull(row[Math.max(0, open)]), high: numberOrNull(row[Math.max(0, high)]), low: numberOrNull(row[Math.max(0, low)]), close: numberOrNull(row[Math.max(0, close)]),
      volume: numberOrNull(row[Math.max(0, volume)]), turnover: numberOrNull(row[Math.max(0, turnover)]), source: "tpex:DAILY_CLOSE_quotes",
    }];
  });
}

function findValueByField(fields: string[], row: unknown[], include: string[], exclude: string[] = []) {
  const idx = fields.findIndex((field) => {
    const normalized = field.replace(/\s+/g, "");
    return include.every((token) => normalized.includes(token)) && exclude.every((token) => !normalized.includes(token));
  });
  return idx >= 0 ? numberValue(row[idx]) : 0;
}

function parseTwseInstitutional(payload: unknown, tradeDate: string): InstitutionalSnapshotRow[] {
  const tables = tableCandidates(payload);
  const table = tables.find((candidate) => fieldIndex(candidate.fields, ["證券代號"]) >= 0 && candidate.fields.some((field) => field.includes("投信")));
  if (!table) return [];
  const code = fieldIndex(table.fields, ["證券代號"]);
  return table.data.flatMap((row) => {
    const symbol = symbolValue(row[code]);
    if (!symbol) return [];
    const foreignBuy = findValueByField(table.fields, row, ["外陸資", "買進"], ["自營商"]) + findValueByField(table.fields, row, ["外資自營商", "買進"]);
    const foreignSell = findValueByField(table.fields, row, ["外陸資", "賣出"], ["自營商"]) + findValueByField(table.fields, row, ["外資自營商", "賣出"]);
    let trustNet = findValueByField(table.fields, row, ["投信", "買賣超"]);
    if (!trustNet) trustNet = findValueByField(table.fields, row, ["投信", "買進"]) - findValueByField(table.fields, row, ["投信", "賣出"]);
    let dealerNet = findValueByField(table.fields, row, ["自營商", "買賣超"], ["外資"]);
    if (!dealerNet) {
      dealerNet = findValueByField(table.fields, row, ["自營商", "自行買賣", "買賣超"]) + findValueByField(table.fields, row, ["自營商", "避險", "買賣超"]);
    }
    return [{ symbol, tradeDate, foreignBuy, foreignSell, foreignNet: foreignBuy - foreignSell, trustNet, dealerNet, source: "twse:T86" }];
  });
}

function parseTpexInstitutional(payload: unknown, tradeDate: string): InstitutionalSnapshotRow[] {
  const tables = tableCandidates(payload);
  const table = tables.find((candidate) => candidate.data.some((row) => Boolean(symbolValue(row[0]))));
  if (!table) return [];
  const fields = table.fields;
  return table.data.flatMap((row) => {
    const symbol = symbolValue(row[0]);
    if (!symbol) return [];
    if (fields.length) {
      const foreignBuy = findValueByField(fields, row, ["外資及陸資", "買進"], ["自營商"]) + findValueByField(fields, row, ["外資自營商", "買進"]);
      const foreignSell = findValueByField(fields, row, ["外資及陸資", "賣出"], ["自營商"]) + findValueByField(fields, row, ["外資自營商", "賣出"]);
      let trustNet = findValueByField(fields, row, ["投信", "買賣超"]);
      if (!trustNet) trustNet = findValueByField(fields, row, ["投信", "買進"]) - findValueByField(fields, row, ["投信", "賣出"]);
      let dealerNet = findValueByField(fields, row, ["自營商", "買賣超"], ["外資"]);
      if (!dealerNet) dealerNet = findValueByField(fields, row, ["自營商", "自行買賣", "買賣超"]) + findValueByField(fields, row, ["自營商", "避險", "買賣超"]);
      return [{ symbol, tradeDate, foreignBuy, foreignSell, foreignNet: foreignBuy - foreignSell, trustNet, dealerNet, source: "tpex:3insti" }];
    }
    // Legacy TPEX aaData layout: code,name,foreign buy/sell/net,
    // foreign-dealer buy/sell/net,trust buy/sell/net,dealer total,...
    const foreignBuy = numberValue(row[2]) + numberValue(row[5]);
    const foreignSell = numberValue(row[3]) + numberValue(row[6]);
    const trustNet = numberValue(row[10]) || (numberValue(row[8]) - numberValue(row[9]));
    const dealerNet = numberValue(row[11]) || (numberValue(row[14]) + numberValue(row[17]));
    return [{ symbol, tradeDate, foreignBuy, foreignSell, foreignNet: foreignBuy - foreignSell, trustNet, dealerNet, source: "tpex:3insti" }];
  });
}

type FinMindPriceRow = { date: string; stock_id: string; Trading_Volume: number; Trading_money: number; open: number; max: number; min: number; close: number };
type FinMindInstitutionRow = { date: string; stock_id: string; buy: number; sell: number; name: string };

async function fetchFinMindBulk<T>(dataset: string, tradeDate: string): Promise<T[]> {
  const url = new URL(FINMIND_API);
  url.searchParams.set("dataset", dataset);
  url.searchParams.set("start_date", tradeDate);
  url.searchParams.set("end_date", tradeDate);
  const token = process.env.FINMIND_API_TOKEN ?? process.env.FINMIND_TOKEN;
  if (token) url.searchParams.set("token", token);
  const payload = await fetchJson(url.toString()) as Record<string, unknown>;
  if (Number(payload.status ?? 0) !== 200) throw new Error(String(payload.msg ?? payload.message ?? `FinMind ${dataset} bulk failed`));
  return Array.isArray(payload.data) ? payload.data as T[] : [];
}

function parseFinMindPrices(rows: FinMindPriceRow[]): PriceSnapshotRow[] {
  return rows.flatMap((row) => {
    const symbol = symbolValue(row.stock_id);
    if (!symbol) return [];
    return [{ symbol, tradeDate: String(row.date), open: numberOrNull(row.open), high: numberOrNull(row.max), low: numberOrNull(row.min), close: numberOrNull(row.close), volume: numberOrNull(row.Trading_Volume), turnover: numberOrNull(row.Trading_money), source: "finmind:bulk:TaiwanStockPrice" }];
  });
}

function parseFinMindInstitutional(rows: FinMindInstitutionRow[]): InstitutionalSnapshotRow[] {
  const bySymbol = new Map<string, InstitutionalSnapshotRow>();
  const foreignNames = new Set(["Foreign_Investor", "Foreign_Dealer_Self", "外資及陸資", "外資"]);
  const trustNames = new Set(["Investment_Trust", "投信"]);
  const dealerNames = new Set(["Dealer_self", "Dealer_Hedging", "Dealer", "自營商", "自營商(自行買賣)", "自營商(避險)"]);
  for (const row of rows) {
    const symbol = symbolValue(row.stock_id);
    if (!symbol) continue;
    const current = bySymbol.get(symbol) ?? { symbol, tradeDate: String(row.date), foreignBuy: 0, foreignSell: 0, foreignNet: 0, trustNet: 0, dealerNet: 0, source: "finmind:bulk:TaiwanStockInstitutionalInvestorsBuySell" };
    const buy = numberValue(row.buy); const sell = numberValue(row.sell); const net = buy - sell; const name = cleanText(row.name);
    if (foreignNames.has(name)) { current.foreignBuy += buy; current.foreignSell += sell; current.foreignNet += net; }
    if (trustNames.has(name)) current.trustNet += net;
    if (dealerNames.has(name)) current.dealerNet += net;
    bySymbol.set(symbol, current);
  }
  return [...bySymbol.values()];
}

async function fetchOfficialSnapshot(tradeDate: string) {
  const twseDate = yyyymmdd(tradeDate);
  const otcDate = encodeURIComponent(rocDate(tradeDate));
  const [twsePricePayload, tpexPricePayload, twseInstPayload, tpexInstPayload] = await Promise.all([
    fetchJson(`https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date=${twseDate}&type=ALLBUT0999&response=json`),
    fetchJson(`https://www.tpex.org.tw/web/stock/aftertrading/DAILY_CLOSE_quotes/stk_quote_result.php?l=zh-tw&o=json&d=${otcDate}&s=0,asc,0`),
    fetchJson(`https://www.twse.com.tw/rwd/zh/fund/T86?date=${twseDate}&selectType=ALL&response=json`),
    fetchJson(`https://www.tpex.org.tw/web/stock/3insti/daily_trade/3itrade_hedge_result.php?l=zh-tw&o=json&se=EW&t=D&d=${otcDate}&s=0,asc`),
  ]);
  const prices = [...parseTwsePrices(twsePricePayload, tradeDate), ...parseTpexPrices(tpexPricePayload, tradeDate)];
  const institutional = [...parseTwseInstitutional(twseInstPayload, tradeDate), ...parseTpexInstitutional(tpexInstPayload, tradeDate)];
  if (prices.length < 500) throw new Error(`Official bulk price snapshot too small: ${prices.length}`);
  if (institutional.length < 300) throw new Error(`Official bulk institutional snapshot too small: ${institutional.length}`);
  return { prices, institutional, priceSource: "TWSE+TPEx official bulk", institutionalSource: "TWSE T86+TPEx 3insti", officialRequests: 4, finmindRequests: 0 };
}

async function fetchFinMindSnapshot(tradeDate: string) {
  const [priceRows, institutionRows] = await Promise.all([
    fetchFinMindBulk<FinMindPriceRow>("TaiwanStockPrice", tradeDate),
    fetchFinMindBulk<FinMindInstitutionRow>("TaiwanStockInstitutionalInvestorsBuySell", tradeDate),
  ]);
  const prices = parseFinMindPrices(priceRows);
  const institutional = parseFinMindInstitutional(institutionRows);
  if (prices.length < 500) throw new Error(`FinMind bulk price snapshot too small: ${prices.length}`);
  if (institutional.length < 300) throw new Error(`FinMind bulk institutional snapshot too small: ${institutional.length}`);
  return { prices, institutional, priceSource: "FinMind bulk TaiwanStockPrice", institutionalSource: "FinMind bulk institutional", officialRequests: 0, finmindRequests: 2 };
}

async function executeManyChunked(db: DatabaseAdapter, statements: DatabaseStatement[]) {
  for (let i = 0; i < statements.length; i += CHUNK_SIZE) {
    await db.executeMany(statements.slice(i, i + CHUNK_SIZE));
  }
}

function resultFromRow(row: BulkSnapshotRunRow | undefined): BulkSnapshotResult {
  return {
    ready: String(row?.status ?? "") === "completed" && Number(row?.price_rows ?? 0) > 0 && Number(row?.institutional_rows ?? 0) > 0,
    cached: true,
    tradeDate: String(row?.trade_date ?? ""),
    status: String(row?.status ?? "waiting"),
    priceSource: row?.price_source == null ? null : String(row.price_source),
    institutionalSource: row?.institutional_source == null ? null : String(row.institutional_source),
    priceRows: Number(row?.price_rows ?? 0),
    institutionalRows: Number(row?.institutional_rows ?? 0),
    accumulationRows: Number(row?.accumulation_rows ?? 0),
    allowedSymbols: Number(row?.allowed_symbols ?? 0),
    externalRequests: Number(row?.external_requests ?? 0),
    finmindRequests: Number(row?.finmind_requests ?? 0),
    officialRequests: Number(row?.official_requests ?? 0),
    lastError: row?.last_error == null ? null : String(row.last_error),
    nextRetryAt: row?.next_retry_at == null ? null : String(row.next_retry_at),
  };
}

export async function readBulkSnapshotStatus(db: DatabaseAdapter, tradeDate: string): Promise<BulkSnapshotResult | null> {
  const row = (await db.execute<BulkSnapshotRunRow>({ sql: "SELECT * FROM daily_bulk_snapshot_runs WHERE trade_date=? LIMIT 1", args: [tradeDate] })).rows[0];
  return row ? resultFromRow(row) : null;
}

async function claimSnapshotLease(db: DatabaseAdapter, tradeDate: string) {
  const now = new Date();
  const nowIso = now.toISOString();
  const leaseToken = randomUUID();
  const leaseUntil = new Date(now.getTime() + SNAPSHOT_LEASE_MS).toISOString();

  await db.execute({
    sql: `INSERT OR IGNORE INTO daily_bulk_snapshot_runs(
      trade_date,status,engine_version,lease_token,lease_until,attempt_count,started_at,updated_at,last_error
    ) VALUES(?,?,?,?,?,0,?,?,NULL)`,
    args: [tradeDate,"waiting",ENGINE_VERSION,null,null,nowIso,nowIso],
  });

  const claim = await db.execute({
    sql: `UPDATE daily_bulk_snapshot_runs SET
      status='running',engine_version=?,lease_token=?,lease_until=?,attempt_count=attempt_count+1,
      started_at=COALESCE(started_at,?),updated_at=?,last_error=NULL,next_retry_at=NULL
      WHERE trade_date=? AND status<>'completed'
        AND (next_retry_at IS NULL OR next_retry_at<=?)
        AND (lease_token IS NULL OR lease_until IS NULL OR lease_until<=? OR status='failed')`,
    args: [ENGINE_VERSION,leaseToken,leaseUntil,nowIso,nowIso,tradeDate,nowIso,nowIso],
  });
  return { owned: claim.rowsAffected > 0, leaseToken, leaseUntil };
}

export async function ensureDailyBulkSnapshot(
  db: DatabaseAdapter,
  tradeDate: string,
  options: { heartbeat?: (phase: string) => Promise<void> } = {},
): Promise<BulkSnapshotResult> {
  await options.heartbeat?.("Bulk Snapshot：檢查交易日快照");
  const cached = await readBulkSnapshotStatus(db, tradeDate).catch(() => null);
  if (cached?.ready) return cached;

  const lease = await claimSnapshotLease(db, tradeDate);
  if (!lease.owned) {
    // Another Queue slice is already fetching this same trading date. Return the
    // compact checkpoint immediately; the continuation chain will retry without
    // issuing duplicate upstream requests.
    return (await readBulkSnapshotStatus(db, tradeDate)) ?? {
      ready:false,cached:true,tradeDate,status:"running",priceSource:null,institutionalSource:null,
      priceRows:0,institutionalRows:0,accumulationRows:0,allowedSymbols:0,externalRequests:0,finmindRequests:0,officialRequests:0,lastError:null,nextRetryAt:null,
    };
  }

  let attemptedOfficialRequests = 0;
  let attemptedFinMindRequests = 0;

  try {
    await options.heartbeat?.("Bulk Snapshot：準備全市場資料源");
    const allowedRows = await db.execute<{ symbol: string }>({ sql: "SELECT symbol FROM stocks WHERE is_active=1" });
    const allowed = new Set(allowedRows.rows.map((row) => String(row.symbol)));

    let snapshot: Awaited<ReturnType<typeof fetchOfficialSnapshot>>;
    const sourcePreference = String(process.env.TWSTOCK_BULK_SOURCE ?? "official").toLowerCase();
    let officialError: string | null = null;
    let finmindError: string | null = null;
    if (sourcePreference === "finmind") {
      attemptedFinMindRequests += 2;
      try { snapshot = await fetchFinMindSnapshot(tradeDate); }
      catch (error) {
        finmindError = error instanceof Error ? error.message : String(error);
        attemptedOfficialRequests += 4;
        snapshot = await fetchOfficialSnapshot(tradeDate);
      }
    } else {
      attemptedOfficialRequests += 4;
      try { snapshot = await fetchOfficialSnapshot(tradeDate); }
      catch (error) {
        officialError = error instanceof Error ? error.message : String(error);
        attemptedFinMindRequests += 2;
        snapshot = await fetchFinMindSnapshot(tradeDate);
      }
    }

    await options.heartbeat?.("Bulk Snapshot：上游市場資料已下載");

    const prices = snapshot.prices.filter((row) => allowed.has(row.symbol) && row.tradeDate === tradeDate && row.close != null);
    const institutional = snapshot.institutional.filter((row) => allowed.has(row.symbol) && row.tradeDate === tradeDate);
    if (!prices.length) throw new Error(`Bulk snapshot contains zero allowed price rows for ${tradeDate}`);
    if (!institutional.length) throw new Error(`Bulk snapshot contains zero allowed institutional rows for ${tradeDate}`);

    const writeNow = new Date().toISOString();
    await options.heartbeat?.(`Bulk Snapshot：寫入 ${prices.length} 筆價格快照`);
    await executeManyChunked(db, prices.map((row) => ({
      sql: `INSERT INTO daily_prices(symbol,trade_date,open,high,low,close,volume,turnover,source,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(symbol,trade_date) DO UPDATE SET
        open=excluded.open,high=excluded.high,low=excluded.low,close=excluded.close,
        volume=excluded.volume,turnover=excluded.turnover,source=excluded.source,updated_at=excluded.updated_at`,
      args: [row.symbol,row.tradeDate,row.open,row.high,row.low,row.close,row.volume,row.turnover,row.source,writeNow],
    })));

    await options.heartbeat?.(`Bulk Snapshot：寫入 ${institutional.length} 筆法人快照`);
    await executeManyChunked(db, institutional.flatMap((row) => ([
      {
        sql: `INSERT INTO foreign_investor_daily(symbol,trade_date,net_buy_shares,buy_shares,sell_shares,source,updated_at)
          VALUES(?,?,?,?,?,?,?) ON CONFLICT(symbol,trade_date) DO UPDATE SET
          net_buy_shares=excluded.net_buy_shares,buy_shares=excluded.buy_shares,sell_shares=excluded.sell_shares,
          source=excluded.source,updated_at=excluded.updated_at`,
        args: [row.symbol,row.tradeDate,row.foreignNet,row.foreignBuy,row.foreignSell,row.source,writeNow],
      },
      {
        sql: `INSERT INTO institutional_holding_daily(symbol,trade_date,foreign_holding_pct,foreign_net_shares,trust_net_shares,dealer_net_shares,source,updated_at)
          VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(symbol,trade_date) DO UPDATE SET
          foreign_net_shares=excluded.foreign_net_shares,trust_net_shares=excluded.trust_net_shares,
          dealer_net_shares=excluded.dealer_net_shares,source=excluded.source,updated_at=excluded.updated_at`,
        args: [row.symbol,row.tradeDate,null,row.foreignNet,row.trustNet,row.dealerNet,row.source,writeNow],
      },
    ])));

    const priceSymbols = new Set(prices.map((row) => row.symbol));
    const institutionalSymbols = new Set(institutional.map((row) => row.symbol));
    const checkpointSymbols = [...new Set([...priceSymbols, ...institutionalSymbols])];
    await executeManyChunked(db, checkpointSymbols.map((symbol) => ({
      sql: `INSERT INTO stock_sync_checkpoint(symbol,price_latest_date,foreign_latest_date,foreign_data_days,last_full_refresh_at,updated_at)
        VALUES(?,?,?,?,NULL,?)
        ON CONFLICT(symbol) DO UPDATE SET
          price_latest_date=CASE WHEN excluded.price_latest_date IS NULL THEN stock_sync_checkpoint.price_latest_date ELSE excluded.price_latest_date END,
          foreign_latest_date=CASE WHEN excluded.foreign_latest_date IS NULL THEN stock_sync_checkpoint.foreign_latest_date ELSE excluded.foreign_latest_date END,
          foreign_data_days=CASE
            WHEN excluded.foreign_latest_date IS NOT NULL AND (stock_sync_checkpoint.foreign_latest_date IS NULL OR stock_sync_checkpoint.foreign_latest_date<excluded.foreign_latest_date)
              THEN MIN(60,stock_sync_checkpoint.foreign_data_days+1)
            ELSE stock_sync_checkpoint.foreign_data_days END,
          updated_at=excluded.updated_at`,
      args: [symbol,priceSymbols.has(symbol)?tradeDate:null,institutionalSymbols.has(symbol)?tradeDate:null,institutionalSymbols.has(symbol)?1:0,writeNow],
    })));

    // Score foreign accumulation in chunked market batches. This replaces the
    // previous 60-row + 61-row Turso reads performed separately for every stock.
    await options.heartbeat?.("Bulk Snapshot：批次計算外資吸籌");
    const accumulation = await refreshForeignAccumulationBulk(db, [...allowed], tradeDate);
    await options.heartbeat?.(`Bulk Snapshot：外資吸籌完成 ${accumulation.scored} 檔`);

    const completedAt = new Date().toISOString();
    const externalRequests = attemptedOfficialRequests + attemptedFinMindRequests;
    const warning = [officialError ? `official fallback: ${officialError}` : "", finmindError ? `finmind fallback: ${finmindError}` : ""].filter(Boolean).join(" | ") || null;
    await db.execute({
      sql: `UPDATE daily_bulk_snapshot_runs SET status='completed',price_source=?,institutional_source=?,
        price_rows=?,institutional_rows=?,accumulation_rows=?,allowed_symbols=?,external_requests=?,finmind_requests=?,official_requests=?,
        completed_at=?,updated_at=?,last_error=?,next_retry_at=NULL,lease_token=NULL,lease_until=NULL WHERE trade_date=? AND lease_token=?`,
      args: [snapshot.priceSource,snapshot.institutionalSource,prices.length,institutional.length,accumulation.scored,allowed.size,externalRequests,attemptedFinMindRequests,attemptedOfficialRequests,completedAt,completedAt,warning,tradeDate,lease.leaseToken],
    });
    const done = await readBulkSnapshotStatus(db, tradeDate);
    if (!done) throw new Error("Bulk snapshot status disappeared after completion");
    return { ...done, cached: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();
    const cooldownMs = /(?:http\s*)?(?:402|429)|quota|rate.?limit|額度/.test(lower)
      ? 60 * 60_000
      : /timeout|timed out|network|fetch|abort/.test(lower)
        ? 5 * 60_000
        : 60_000;
    const nextRetryAt = new Date(Date.now() + cooldownMs).toISOString();
    await db.execute({
      sql: "UPDATE daily_bulk_snapshot_runs SET status='failed',last_error=?,next_retry_at=?,external_requests=?,finmind_requests=?,official_requests=?,updated_at=?,lease_token=NULL,lease_until=NULL WHERE trade_date=? AND lease_token=?",
      args: [message.slice(0,900),nextRetryAt,attemptedOfficialRequests+attemptedFinMindRequests,attemptedFinMindRequests,attemptedOfficialRequests,new Date().toISOString(),tradeDate,lease.leaseToken],
    }).catch(() => undefined);
    return {
      ready:false,cached:false,tradeDate,status:"failed",priceSource:null,institutionalSource:null,
      priceRows:0,institutionalRows:0,accumulationRows:0,allowedSymbols:0,externalRequests:attemptedOfficialRequests+attemptedFinMindRequests,
      finmindRequests:attemptedFinMindRequests,officialRequests:attemptedOfficialRequests,lastError:message,nextRetryAt,
    };
  }
}
