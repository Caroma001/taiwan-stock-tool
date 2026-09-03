import type {
  PriceProvider,
  PriceProviderParams,
  PriceProviderRow,
} from "@/providers/types";

type FinMindPriceApiRow = {
  date: string;
  stock_id: string;
  Trading_Volume: number;
  Trading_money: number;
  open: number;
  max: number;
  min: number;
  close: number;
};

type FinMindForeignApiRow = {
  date: string;
  stock_id: string;
  buy: number;
  sell: number;
  name: string;
};

type FinMindApiResponse<T> = {
  msg: string;
  status: number;
  data: T[];
};

export type ForeignTradingProviderRow = {
  symbol: string;
  trade_date: string;
  foreign_buy: number;
  foreign_sell: number;
  foreign_net: number;
  source: string;
};

export type InstitutionalTradingProviderRow = {
  symbol: string;
  trade_date: string;
  foreign_net: number;
  trust_net: number;
  dealer_net: number;
  source: string;
};

function getFinMindToken(): string | undefined {
  return process.env.FINMIND_API_TOKEN ?? process.env.FINMIND_TOKEN;
}

async function fetchFinMindData<T>(params: {
  dataset: string;
  symbol: string;
  startDate: string;
  endDate?: string;
}): Promise<T[]> {
  const url = new URL("https://api.finmindtrade.com/api/v4/data");

  url.searchParams.set("dataset", params.dataset);
  url.searchParams.set("data_id", params.symbol);
  url.searchParams.set("start_date", params.startDate);

  if (params.endDate) {
    url.searchParams.set("end_date", params.endDate);
  }

  const token = getFinMindToken();

  if (token) {
    url.searchParams.set("token", token);
  }

  const response = await fetch(url.toString(), {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`FinMind API 連線失敗：HTTP ${response.status}`);
  }

  const json = (await response.json()) as FinMindApiResponse<T>;

  if (json.status !== 200) {
    throw new Error(`FinMind API 回傳錯誤：${json.msg}`);
  }

  return json.data ?? [];
}

export const FinMindPriceProvider: PriceProvider = {
  name: "finmind",

  async fetchPrices(params: PriceProviderParams): Promise<PriceProviderRow[]> {
    const symbol = params.symbol.trim();

    const rows = await fetchFinMindData<FinMindPriceApiRow>({
      dataset: "TaiwanStockPrice",
      symbol,
      startDate: params.startDate,
      endDate: params.endDate,
    });

    return rows.map((row) => ({
      symbol: row.stock_id,
      trade_date: row.date,
      open: row.open ?? null,
      high: row.max ?? null,
      low: row.min ?? null,
      close: row.close ?? null,
      volume: row.Trading_Volume ?? null,
      turnover: row.Trading_money ?? null,
      source: "finmind",
    }));
  },
};

export async function fetchForeignTrading(params: {
  symbol: string;
  startDate: string;
  endDate?: string;
}): Promise<ForeignTradingProviderRow[]> {
  const symbol = params.symbol.trim();

  const rows = await fetchFinMindData<FinMindForeignApiRow>({
    dataset: "TaiwanStockInstitutionalInvestorsBuySell",
    symbol,
    startDate: params.startDate,
    endDate: params.endDate,
  });

  const acceptedNames = new Set([
    "Foreign_Investor",
    "Foreign_Dealer_Self",
    "外資及陸資",
    "外資",
  ]);

  // FinMind may return more than one foreign-investor category on the same date.
  // Aggregate by date so the database keeps exactly one deterministic row per symbol/day.
  const byDate = new Map<string, ForeignTradingProviderRow>();
  for (const row of rows) {
    if (!acceptedNames.has(String(row.name ?? ""))) continue;
    const foreignBuy = Number(row.buy ?? 0);
    const foreignSell = Number(row.sell ?? 0);
    const key = String(row.date);
    const current = byDate.get(key) ?? {
      symbol: row.stock_id,
      trade_date: key,
      foreign_buy: 0,
      foreign_sell: 0,
      foreign_net: 0,
      source: "finmind",
    };
    current.foreign_buy += Number.isFinite(foreignBuy) ? foreignBuy : 0;
    current.foreign_sell += Number.isFinite(foreignSell) ? foreignSell : 0;
    current.foreign_net = current.foreign_buy - current.foreign_sell;
    byDate.set(key, current);
  }

  return [...byDate.values()].sort((a, b) =>
    a.trade_date.localeCompare(b.trade_date),
  );
}

export async function fetchInstitutionalTrading(params: {
  symbol: string;
  startDate: string;
  endDate?: string;
}): Promise<InstitutionalTradingProviderRow[]> {
  const symbol = params.symbol.trim();
  const rows = await fetchFinMindData<FinMindForeignApiRow>({
    dataset: "TaiwanStockInstitutionalInvestorsBuySell",
    symbol,
    startDate: params.startDate,
    endDate: params.endDate,
  });

  const foreignNames = new Set(["Foreign_Investor", "Foreign_Dealer_Self", "外資及陸資", "外資"]);
  const trustNames = new Set(["Investment_Trust", "投信"]);
  const dealerNames = new Set(["Dealer_self", "Dealer_Hedging", "Dealer", "自營商", "自營商(自行買賣)", "自營商(避險)"]);
  const byDate = new Map<string, InstitutionalTradingProviderRow>();

  for (const row of rows) {
    const key = String(row.date);
    const current = byDate.get(key) ?? {
      symbol: row.stock_id,
      trade_date: key,
      foreign_net: 0,
      trust_net: 0,
      dealer_net: 0,
      source: "finmind",
    };
    const net = Number(row.buy ?? 0) - Number(row.sell ?? 0);
    const name = String(row.name ?? "");
    if (foreignNames.has(name)) current.foreign_net += Number.isFinite(net) ? net : 0;
    if (trustNames.has(name)) current.trust_net += Number.isFinite(net) ? net : 0;
    if (dealerNames.has(name)) current.dealer_net += Number.isFinite(net) ? net : 0;
    byDate.set(key, current);
  }

  return [...byDate.values()].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
}
