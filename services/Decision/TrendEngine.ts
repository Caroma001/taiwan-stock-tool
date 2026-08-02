import type { DecisionInput, EngineScore } from "./types";
import { clamp, num, pctDistance } from "./utils";

export function runTrendEngine(input: DecisionInput): EngineScore {
  const i = input.indicator;
  const close = input.close;
  const ma5 = num(i.ma5), ma20 = num(i.ma20), ma60 = num(i.ma60), ma240 = num(i.ma240);
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;

  if (ma5 !== null && close >= ma5) { score += 5; reasons.push("收盤站上 MA5"); }
  if (ma20 !== null && close >= ma20) { score += 7; reasons.push("收盤站上 MA20"); }
  if (ma60 !== null && close >= ma60) { score += 5; reasons.push("收盤站上 MA60"); }
  if (ma5 !== null && ma20 !== null && ma5 > ma20) { score += 5; reasons.push("MA5 高於 MA20"); }
  if (ma20 !== null && ma60 !== null && ma20 > ma60) { score += 5; reasons.push("MA20 高於 MA60"); }
  if (ma60 !== null && ma240 !== null && ma60 > ma240) { score += 3; reasons.push("中長期均線偏多"); }

  if (ma20 !== null) {
    const distance = pctDistance(close, ma20);
    if (distance > 12) { score -= 4; warnings.push("股價明顯乖離 MA20，追價風險增加"); }
    if (distance < -3) warnings.push("股價跌破 MA20");
  }
  if (ma60 !== null && close < ma60) warnings.push("股價位於 MA60 下方");

  return { score: clamp(score, 0, 30), reasons, warnings };
}
