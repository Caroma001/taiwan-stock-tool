import type { DecisionInput, EngineScore } from "./types";
import { clamp, num } from "./utils";

export function runMomentumEngine(input: DecisionInput): EngineScore {
  const i = input.indicator;
  const rsi = num(i.rsi14), k = num(i.k ?? i.k9), d = num(i.d ?? i.d9);
  const histogram = num(i.macd_histogram);
  const volumeMa5 = num(i.volume_ma5), volumeMa20 = num(i.volume_ma20);
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;

  if (rsi !== null) {
    if (rsi >= 48 && rsi <= 68) { score += 8; reasons.push("RSI 位於健康動能區"); }
    else if (rsi > 68 && rsi <= 78) { score += 5; warnings.push("RSI 偏熱"); }
    else if (rsi > 78) warnings.push("RSI 過熱");
    else if (rsi < 35) warnings.push("RSI 偏弱");
  }
  if (k !== null && d !== null) {
    if (k > d && k <= 80) { score += 7; reasons.push("KD 多方排列"); }
    else if (k < d) warnings.push("KD 偏空");
    if (k > 88) warnings.push("KD 高檔過熱");
  }
  if (histogram !== null) {
    if (histogram > 0) { score += 7; reasons.push("MACD 柱為正"); }
    else warnings.push("MACD 柱為負");
  }
  if (volumeMa5 !== null && volumeMa20 !== null && volumeMa20 > 0) {
    const ratio = volumeMa5 / volumeMa20;
    if (ratio >= 1.05 && ratio <= 2.2) { score += 5; reasons.push("短期量能高於月均量"); }
    else if (ratio > 2.2) { score += 2; warnings.push("短期量能過度放大"); }
  }

  return { score: clamp(score, 0, 25), reasons, warnings };
}
