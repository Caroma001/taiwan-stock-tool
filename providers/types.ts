export type PriceProviderRow = {
    symbol: string;
    trade_date: string;
    open: number | null;
    high: number | null;
    low: number | null;
    close: number | null;
    volume: number | null;
    turnover: number | null;
    source: string;
  };
  
  export type PriceProviderParams = {
    symbol: string;
    startDate: string;
    endDate?: string;
  };
  
  export type PriceProvider = {
    name: string;
    fetchPrices(params: PriceProviderParams): Promise<PriceProviderRow[]>;
  };