export type NumericValue = number | string | null | undefined;

export type DecisionInput = {
  symbol: string;
  stockName: string;
  tradeDate: string;
  close: number;
  indicator: Record<string, NumericValue>;
  ai: Record<string, NumericValue> | null;
};

export type EngineScore = {
  score: number;
  reasons: string[];
  warnings: string[];
};

export type RiskLevel = "low" | "medium" | "high" | "critical";
export type DecisionAction =
  | "strong_buy_watch"
  | "buy_watch"
  | "hold"
  | "reduce"
  | "take_profit"
  | "stop_loss"
  | "avoid";

export type RiskResult = EngineScore & {
  level: RiskLevel;
  stopLossPct: number;
};

export type ExitResult = {
  targetPrice1: number;
  targetPrice2: number;
  stopLossPrice: number;
  trailingStopPrice: number;
  expectedHoldDays: number;
  expectedReturnPct: number;
  riskRewardRatio: number;
  reasons: string[];
};

export type DecisionWeights = {
  trend: number;
  momentum: number;
  risk: number;
  aiBase: number;
  version: string;
  source: "default" | "learned" | "manual";
};

export const DEFAULT_DECISION_WEIGHTS: DecisionWeights = {
  trend: 0.3,
  momentum: 0.25,
  risk: 0.25,
  aiBase: 0.2,
  version: "M5.0-default-v1",
  source: "default",
};

export type DecisionResult = {
  symbol: string;
  stock_name: string;
  trade_date: string;
  close: number;
  total_score: number;
  weighted_score: number;
  trend_score: number;
  momentum_score: number;
  risk_score: number;
  ai_base_score: number;
  action: DecisionAction;
  risk_level: RiskLevel;
  confidence: number;
  target_price_1: number;
  target_price_2: number;
  stop_loss_price: number;
  trailing_stop_price: number;
  expected_hold_days: number;
  expected_return_pct: number;
  risk_reward_ratio: number;
  reasons: string[];
  warnings: string[];
  snapshot: Record<string, unknown>;
  component_weights: Record<string, number>;
  weight_version: string;
  model_version: string;
  analyzed_at: string;
  updated_at: string;
};
