import type { AnalysisResult, DecisionResult, IndicatorDbRow, Recommendation } from "./types";

const round = (v: number) => Math.round(v * 100) / 100;
export function createDecision(row: IndicatorDbRow, analysis: AnalysisResult): DecisionResult {
  const close = row.close;
  if (close === null || close <= 0) return { recommendation: "等待", target1: null, target2: null, stopLoss: null, expectedReturn: null, riskReward: null, holdingDays: 14, confidence: analysis.confidence, reason: "缺少有效收盤價" };
  const atr = row.atr14 && row.atr14 > 0 ? row.atr14 : close * 0.035;
  const target1 = round(Math.max(close + atr * 2, close * 1.07));
  const target2 = round(Math.max(close + atr * 3.5, close * 1.12));
  const stop = round(Math.min(close - atr * 1.5, close * 0.95));
  const expectedReturn = round((target1 / close - 1) * 100);
  const downside = Math.max(0.01, close - stop);
  const riskReward = round((target1 - close) / downside);
  let recommendation: Recommendation = "等待";
  if (analysis.totalScore >= 85 && riskReward >= 1.5) recommendation = "強勢觀察";
  else if (analysis.totalScore >= 75 && riskReward >= 1.2) recommendation = "買進觀察";
  else if (analysis.totalScore >= 65) recommendation = "續抱";
  else if (analysis.totalScore < 45) recommendation = "停損";
  const reason = `${analysis.reasons.slice(0, 3).join("；")}；總分 ${round(analysis.totalScore)}，風報比 ${riskReward}`;
  return { recommendation, target1, target2, stopLoss: stop, expectedReturn, riskReward, holdingDays: 14, confidence: analysis.confidence, reason };
}
