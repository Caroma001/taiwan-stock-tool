import type {
  DecisionAction,
  DecisionInput,
  DecisionResult,
  DecisionWeights,
} from "./types";
import { DEFAULT_DECISION_WEIGHTS } from "./types";
import { clamp } from "./utils";
import { runTrendEngine } from "./TrendEngine";
import { runMomentumEngine } from "./MomentumEngine";
import { runRiskEngine } from "./RiskEngine";
import { runExitEngine } from "./ExitEngine";

function normalizedWeights(weights: DecisionWeights): DecisionWeights {
  const values = [weights.trend, weights.momentum, weights.risk, weights.aiBase].map((v) =>
    Math.max(0.05, Number.isFinite(v) ? v : 0),
  );
  const total = values.reduce((sum, value) => sum + value, 0) || 1;
  return {
    trend: values[0] / total,
    momentum: values[1] / total,
    risk: values[2] / total,
    aiBase: values[3] / total,
    version: weights.version,
    source: weights.source,
  };
}

export function analyzeDecision(
  input: DecisionInput,
  suppliedWeights: DecisionWeights = DEFAULT_DECISION_WEIGHTS,
): DecisionResult {
  const weights = normalizedWeights(suppliedWeights);
  const trend = runTrendEngine(input);
  const momentum = runMomentumEngine(input);
  const risk = runRiskEngine(input);
  const aiBase = clamp(Number(input.ai?.total_score ?? 50), 0, 100);

  const weightedScore = clamp(
    (trend.score / 30) * 100 * weights.trend +
      (momentum.score / 25) * 100 * weights.momentum +
      (risk.score / 25) * 100 * weights.risk +
      aiBase * weights.aiBase,
    0,
    100,
  );
  const total = Math.round(weightedScore);
  const exit = runExitEngine(input, total, risk);

  let action: DecisionAction = "avoid";
  if (risk.level === "critical") action = "stop_loss";
  else if (total >= 85 && risk.level !== "high") action = "strong_buy_watch";
  else if (total >= 72 && risk.level !== "high") action = "buy_watch";
  else if (total >= 58) action = "hold";
  else if (total >= 42) action = "reduce";

  const confidence = Math.round(
    clamp(total * 0.68 + risk.score * 0.7 + (weights.source === "learned" ? 5 : 0), 0, 97),
  );
  const now = new Date().toISOString();

  return {
    symbol: input.symbol,
    stock_name: input.stockName,
    trade_date: input.tradeDate,
    close: input.close,
    total_score: total,
    weighted_score: Number(weightedScore.toFixed(2)),
    trend_score: trend.score,
    momentum_score: momentum.score,
    risk_score: risk.score,
    ai_base_score: aiBase,
    action,
    risk_level: risk.level,
    confidence,
    target_price_1: exit.targetPrice1,
    target_price_2: exit.targetPrice2,
    stop_loss_price: exit.stopLossPrice,
    trailing_stop_price: exit.trailingStopPrice,
    expected_hold_days: exit.expectedHoldDays,
    expected_return_pct: exit.expectedReturnPct,
    risk_reward_ratio: exit.riskRewardRatio,
    reasons: [...trend.reasons, ...momentum.reasons, ...risk.reasons, ...exit.reasons].slice(0, 12),
    warnings: [...trend.warnings, ...momentum.warnings, ...risk.warnings].slice(0, 10),
    snapshot: {
      indicator: input.indicator,
      previous_ai: input.ai,
      weights,
    },
    component_weights: {
      trend: weights.trend,
      momentum: weights.momentum,
      risk: weights.risk,
      aiBase: weights.aiBase,
    },
    weight_version: weights.version,
    model_version: "M5.0-self-learning-v1",
    analyzed_at: now,
    updated_at: now,
  };
}
