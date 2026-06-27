export type PortfolioRow = {
  id: number;
  symbol: string;
  name: string;
  market: string;
  buy_price: number;
  shares: number;
  close: number | null;
  trade_date: string | null;
  profit: number | null;
  profitPercent: number | null;
  historyCount: number;
  hasTwoYearHistory: boolean;

  aiScore?: number | null;
  aiSignal?: string | null;
  aiSummary?: string | null;
  aiRiskLevel?: string | null;
};