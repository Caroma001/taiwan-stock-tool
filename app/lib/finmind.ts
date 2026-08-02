const FINMIND_API = "https://api.finmindtrade.com/api/v4/data";

function getToken() {
  return process.env.FINMIND_API_TOKEN || "";
}

export type FinMindPrice = {
  date: string;
  stock_id: string;
  Trading_Volume: number;
  Trading_money: number;
  open: number;
  max: number;
  min: number;
  close: number;
  spread: number;
  Trading_turnover: number;
};

export async function fetchFinMindStockPrice(
  symbol: string,
  startDate: string,
  endDate?: string
): Promise<FinMindPrice[]> {
  const params = new URLSearchParams({
    dataset: "TaiwanStockPrice",
    data_id: symbol,
    start_date: startDate,
  });

  if (endDate) {
    params.set("end_date", endDate);
  }

  const token = getToken();

  const res = await fetch(`${FINMIND_API}?${params.toString()}`, {
    cache: "no-store",
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {},
  });

  const json = await res.json();

  if (!res.ok || json.status !== 200) {
    throw new Error(json.msg || json.message || "FinMind 股價資料取得失敗");
  }

  return json.data || [];
}

export async function fetchFinMindStockInfo(symbol: string) {
  const params = new URLSearchParams({
    dataset: "TaiwanStockInfo",
  });

  const token = getToken();

  const res = await fetch(`${FINMIND_API}?${params.toString()}`, {
    cache: "no-store",
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {},
  });

  const json = await res.json();

  if (!res.ok || json.status !== 200) {
    throw new Error(json.msg || json.message || "FinMind 股票基本資料取得失敗");
  }

  const list = json.data || [];

  return (
    list.find((item: any) => String(item.stock_id) === symbol) || null
  );
}