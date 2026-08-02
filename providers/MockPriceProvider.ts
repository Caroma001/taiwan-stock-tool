import type {
    PriceProvider,
    PriceProviderParams,
    PriceProviderRow,
  } from "@/providers/types";
  
  export const MockPriceProvider: PriceProvider = {
    name: "mock",
  
    async fetchPrices(params: PriceProviderParams): Promise<PriceProviderRow[]> {
      const symbol = params.symbol.trim();
  
      return [
        {
          symbol,
          trade_date: "2026-07-01",
          open: 158,
          high: 164,
          low: 157,
          close: 163,
          volume: 12500,
          turnover: 2037500000,
          source: "mock",
        },
        {
          symbol,
          trade_date: "2026-07-02",
          open: 163,
          high: 166,
          low: 160,
          close: 161,
          volume: 9800,
          turnover: 1577800000,
          source: "mock",
        },
        {
          symbol,
          trade_date: "2026-07-03",
          open: 161,
          high: 168,
          low: 160,
          close: 166,
          volume: 13200,
          turnover: 2191200000,
          source: "mock",
        },
      ];
    },
  };