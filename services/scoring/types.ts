import type { DatabaseRow } from "@/lib/database";

export interface PriceRow extends DatabaseRow {
  symbol: string; trade_date: string; open: number | null; high: number | null;
  low: number | null; close: number | null; volume: number | null; turnover: number | null;
}
export interface StockRow extends DatabaseRow { symbol: string; name: string; is_active: number; }
export interface IndicatorDbRow extends DatabaseRow {
  symbol: string; trade_date: string; close: number | null; ma5: number | null; ma10: number | null;
  ma20: number | null; ma60: number | null; ma120: number | null; ma240: number | null;
  volume_ma5: number | null; volume_ma20: number | null; rsi14: number | null; k: number | null;
  d: number | null; macd: number | null; macd_signal: number | null; macd_histogram: number | null;
  bollinger_upper: number | null; bollinger_middle: number | null; bollinger_lower: number | null;
  atr14: number | null; calculated_at: string;
}
export type Recommendation = "強勢觀察" | "買進觀察" | "續抱" | "等待" | "停利" | "停損";
export interface AnalysisResult {
  trendScore: number; momentumScore: number; volumeScore: number; riskScore: number;
  totalScore: number; confidence: number; reasons: string[];
}
export interface DecisionResult {
  recommendation: Recommendation; target1: number | null; target2: number | null; stopLoss: number | null;
  expectedReturn: number | null; riskReward: number | null; holdingDays: number; confidence: number; reason: string;
}
