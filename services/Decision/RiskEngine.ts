import type { DecisionInput, RiskResult, RiskLevel } from "./types";
import { clamp, num } from "./utils";

export function runRiskEngine(input: DecisionInput): RiskResult {
  const i = input.indicator;
  const close = input.close;
  const atr = num(i.atr14), rsi = num(i.rsi14), upper = num(i.bollinger_upper), ma20 = num(i.ma20), ma60 = num(i.ma60);
  const reasons: string[] = [];
  const warnings: string[] = [];
  const atrPct = atr !== null && close > 0 ? (atr / close) * 100 : 4;
  let score = 25;

  if (atrPct <= 2.5) reasons.push("ATR 波動相對穩定");
  else if (atrPct <= 4.5) score -= 4;
  else if (atrPct <= 7) { score -= 10; warnings.push("波動度偏高"); }
  else { score -= 17; warnings.push("波動度極高"); }

  if (rsi !== null && rsi > 78) score -= 5;
  if (upper !== null && close > upper * 1.02) { score -= 5; warnings.push("價格明顯超越布林上軌"); }
  if (ma20 !== null && close < ma20) { score -= 5; warnings.push("跌破 MA20 支撐"); }
  if (ma60 !== null && close < ma60) { score -= 4; warnings.push("跌破 MA60 支撐"); }

  const finalScore = clamp(score, 0, 25);
  let level: RiskLevel = "low";
  if (finalScore < 8) level = "critical";
  else if (finalScore < 14) level = "high";
  else if (finalScore < 20) level = "medium";

  const stopLossPct = Math.max(5, Math.min(10, atrPct * 1.8));
  return { score: finalScore, level, stopLossPct, reasons, warnings };
}
