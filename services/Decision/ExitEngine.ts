import type { DecisionInput, ExitResult, RiskResult } from "./types";
import { num, round } from "./utils";

export function runExitEngine(input: DecisionInput, totalScore: number, risk: RiskResult): ExitResult {
  const close = input.close;
  const atr = num(input.indicator.atr14) ?? close * 0.035;
  const upper = num(input.indicator.bollinger_upper);
  const ma20 = num(input.indicator.ma20);
  const scoreTarget = totalScore >= 88 ? 0.2 : totalScore >= 78 ? 0.15 : totalScore >= 68 ? 0.1 : 0.07;
  const atrTarget = Math.min(0.25, Math.max(0.07, (atr / close) * 4));
  const targetPct1 = Math.min(0.18, Math.max(0.07, Math.min(scoreTarget, atrTarget + 0.03)));
  const targetPct2 = Math.min(0.25, Math.max(targetPct1 + 0.04, scoreTarget + 0.04));

  let targetPrice1 = close * (1 + targetPct1);
  if (upper !== null && upper > close) targetPrice1 = Math.max(targetPrice1, upper);
  const targetPrice2 = close * (1 + targetPct2);

  const hardStop = close * (1 - risk.stopLossPct / 100);
  const technicalStop = ma20 !== null && ma20 < close ? ma20 * 0.985 : hardStop;
  const stopLossPrice = Math.max(hardStop, technicalStop);
  const trailingStopPrice = close - atr * 2.2;
  const reward = targetPrice1 - close;
  const loss = close - stopLossPrice;
  const ratio = loss > 0 ? reward / loss : 0;
  const expectedHoldDays = totalScore >= 85 ? 10 : totalScore >= 72 ? 14 : 20;

  return {
    targetPrice1: round(targetPrice1),
    targetPrice2: round(targetPrice2),
    stopLossPrice: round(stopLossPrice),
    trailingStopPrice: round(Math.max(stopLossPrice, trailingStopPrice)),
    expectedHoldDays,
    expectedReturnPct: round(targetPct1 * 100),
    riskRewardRatio: round(ratio),
    reasons: ["目標價依 AI 分數、ATR 與布林通道估算", "停損價同時參考硬停損與 MA20 支撐"],
  };
}
