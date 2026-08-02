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

function getFinMindToken(): string | undefined {
  return process.env.FINMIND_API_TOKEN;
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

  const foreignRows = rows.filter((row) => {
    return (
      row.name === "Foreign_Investor" ||
      row.name === "Foreign_Dealer_Self" ||
      row.name === "外資及陸資"
    );
  });

  return foreignRows.map((row) => {
    const foreignBuy = Number(row.buy ?? 0);
    const foreignSell = Number(row.sell ?? 0);

    return {
      symbol: row.stock_id,
      trade_date: row.date,
      foreign_buy: foreignBuy,
      foreign_sell: foreignSell,
      foreign_net: foreignBuy - foreignSell,
      source: "finmind",
    };
  });
}