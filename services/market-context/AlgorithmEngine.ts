import type { AnalysisResult, DecisionResult, IndicatorDbRow, Recommendation } from "@/services/scoring/types";

export const ALGORITHM_VERSION = "RULES-1";

export type MarketContext = {
  score: number;
  regime: string;
  riskLevel: string;
  confidence: number;
};

export type AlgorithmScore = AnalysisResult & {
  rawScore: number;
  marketAdjustment: number;
  finalScore: number;
  marketScore: number;
  marketRegime: string;
  algorithmVersion: string;
};

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const round = (value: number) => Math.round(value * 100) / 100;

export function defaultMarketContext(): MarketContext {
  return { score: 50, regime: "盤整", riskLevel: "中", confidence: 50 };
}

/**
 * 100% deterministic market adjustment.
 * A weak market rewards lower volatility and durable trend; a strong market rewards
 * momentum and participation. This makes the market layer change relative ranking,
 * rather than multiplying every stock by the same constant.
 */
export function applyMarketContext(base: AnalysisResult, market: MarketContext): AlgorithmScore {
  const marketScore = clamp(market.score);
  const trendQuality = base.trendScore / 30;
  const momentumQuality = base.momentumScore / 25;
  const volumeQuality = base.volumeScore / 20;
  const defensiveQuality = base.riskScore / 25;

  let adjustment = 0;
  if (marketScore < 40) {
    const stress = (40 - marketScore) / 40;
    adjustment = -12 * stress + defensiveQuality * 7 + trendQuality * 5 - momentumQuality * 3;
  } else if (marketScore < 55) {
    adjustment = -3 + defensiveQuality * 3 + trendQuality * 2;
  } else if (marketScore >= 70) {
    const strength = (marketScore - 70) / 30;
    adjustment = 1 + trendQuality * 3 + momentumQuality * (3 + strength * 2) + volumeQuality * 2;
  } else {
    adjustment = trendQuality * 1.5 + momentumQuality * 1.5 + defensiveQuality;
  }

  // Avoid allowing market context to hide a fundamentally weak stock.
  if (base.totalScore < 50) adjustment = Math.min(adjustment, 0);
  adjustment = clamp(adjustment, -18, 10);
  const finalScore = clamp(base.totalScore + adjustment);
  const marketDataConfidence = clamp(market.confidence, 0, 100);
  const confidence = clamp(base.confidence * 0.8 + marketDataConfidence * 0.2, 0, 95);
  const reasons = [
    ...base.reasons,
    `市場環境 ${market.regime}（${marketScore.toFixed(0)} 分）`,
    `市場調整 ${adjustment >= 0 ? "+" : ""}${adjustment.toFixed(2)} 分`,
  ];

  return {
    ...base,
    confidence: round(confidence),
    reasons,
    rawScore: round(base.totalScore),
    marketAdjustment: round(adjustment),
    finalScore: round(finalScore),
    totalScore: round(finalScore),
    marketScore: round(marketScore),
    marketRegime: market.regime,
    algorithmVersion: ALGORITHM_VERSION,
  };
}

export function createMarketAwareDecision(row: IndicatorDbRow, score: AlgorithmScore): DecisionResult {
  const close = row.close;
  if (close === null || close <= 0) {
    return { recommendation: "等待", target1: null, target2: null, stopLoss: null, expectedReturn: null, riskReward: null, holdingDays: 10, confidence: score.confidence, reason: "缺少有效收盤價" };
  }

  const atr = row.atr14 && row.atr14 > 0 ? row.atr14 : close * 0.035;
  const riskMultiplier = score.marketScore < 35 ? 1.15 : score.marketScore < 50 ? 1.3 : 1.5;
  const stop = round(Math.max(close - atr * riskMultiplier, close * (score.marketScore < 35 ? 0.965 : 0.94)));
  const targetMultiplier = score.marketScore >= 70 ? 2.2 : score.marketScore >= 50 ? 1.9 : 1.55;
  const target1 = round(close + atr * targetMultiplier);
  const target2 = round(close + atr * (targetMultiplier + 1.15));
  const expectedReturn = round((target1 / close - 1) * 100);
  const downside = Math.max(0.01, close - stop);
  const riskReward = round((target1 - close) / downside);

  const highRiskMarket = score.marketScore < 40;
  const strongThreshold = highRiskMarket ? 90 : score.marketScore >= 70 ? 83 : 86;
  const buyThreshold = highRiskMarket ? 84 : score.marketScore >= 70 ? 74 : 78;
  const holdThreshold = highRiskMarket ? 73 : 65;

  let recommendation: Recommendation = "等待";
  if (score.finalScore >= strongThreshold && riskReward >= (highRiskMarket ? 1.8 : 1.45)) recommendation = "強勢觀察";
  else if (score.finalScore >= buyThreshold && riskReward >= (highRiskMarket ? 1.55 : 1.2)) recommendation = "買進觀察";
  else if (score.finalScore >= holdThreshold) recommendation = "續抱";
  else if (score.finalScore < 42) recommendation = "停損";

  const reason = `${score.reasons.slice(0, 4).join("；")}；規則分數 ${score.finalScore.toFixed(2)}，風報比 ${riskReward}`;
  return { recommendation, target1, target2, stopLoss: stop, expectedReturn, riskReward, holdingDays: 10, confidence: score.confidence, reason };
}
