export type Swing10ExitAction = "hold" | "watch" | "sell_check";

export type Swing10ExitRuleInput = {
  currentReturnPct: number | null;
  maxReturnPct: number | null;
  holdingDays: number;
  currentGrade: string;
  inTop20: boolean;
  decisionChangeFromEntry: number | null;
  foreignPersistenceScore: number | null;
  marketRiskLevel: string;
  daytradeNoisePenalty: number | null;
  riskChangeLevel: string;
  takeProfitPct: number;
  stopLossPct: number;
  maxHoldingDays: number;
  noMomentumCheckDay: number;
  noMomentumMinPeakPct: number;
  profitProtectTriggerPct: number;
  profitProtectGivebackPct: number;
};

export type Swing10ExitRuleResult = {
  action: Swing10ExitAction;
  severity: "green" | "yellow" | "red";
  reasons: string[];
  drawdownFromPeakPct: number | null;
  confirmationCount: number;
};

/**
 * M8.11.3 Multi-confirm Exit Alert
 *
 * Hard exits (stop loss / take profit / time stop / profit protection) may
 * raise a red alert by themselves.  Signal deterioration is different: a
 * single Decision-score drop or one bad market day only creates WATCH.
 * SELL_CHECK requires at least two independent deterioration confirmations.
 */
export function evaluateSwing10ExitRules(input: Swing10ExitRuleInput): Swing10ExitRuleResult {
  const drawdown = input.currentReturnPct == null || input.maxReturnPct == null
    ? null
    : Number((input.maxReturnPct - input.currentReturnPct).toFixed(2));
  const hardSell: string[] = [];
  const confirmations: string[] = [];
  const watch: string[] = [];

  // Price/time rules are explicit user-facing risk controls and remain hard.
  if (input.currentReturnPct != null && input.currentReturnPct <= input.stopLossPct) {
    hardSell.push(`停損觸發 ${input.currentReturnPct.toFixed(1)}% ≤ ${input.stopLossPct.toFixed(1)}%`);
  }
  if (input.currentReturnPct != null && input.currentReturnPct >= input.takeProfitPct) {
    hardSell.push(`停利目標 ${input.currentReturnPct.toFixed(1)}% ≥ +${input.takeProfitPct.toFixed(1)}%`);
  }
  if (input.holdingDays >= input.maxHoldingDays) {
    hardSell.push(`Time Stop：已持有 ${input.holdingDays} 個交易日`);
  }
  if (
    input.maxReturnPct != null && drawdown != null
    && input.maxReturnPct >= input.profitProtectTriggerPct
    && drawdown >= input.profitProtectGivebackPct
  ) {
    hardSell.push(`獲利保護：高點 +${input.maxReturnPct.toFixed(1)}%，已回吐 ${drawdown.toFixed(1)}%`);
  }

  const decisionWeak = input.decisionChangeFromEntry != null && input.decisionChangeFromEntry <= -7;
  const foreignWeak = input.foreignPersistenceScore != null && input.foreignPersistenceScore < 55;
  const foreignVeryWeak = input.foreignPersistenceScore != null && input.foreignPersistenceScore < 45;
  const gradeBreakdown = input.currentGrade === "C" && input.holdingDays >= 3;
  const priceWeak = input.currentReturnPct != null && input.currentReturnPct <= -3;
  const matureTop20Exit = !input.inTop20 && input.holdingDays >= 7;
  const noMomentum = input.holdingDays >= input.noMomentumCheckDay && (input.maxReturnPct ?? 0) < input.noMomentumMinPeakPct;
  const noiseHigh = input.daytradeNoisePenalty != null && input.daytradeNoisePenalty >= 7;

  // Independent confirmations. Market risk is deliberately NOT counted by
  // itself because it is already reflected in Decision Score.
  if (decisionWeak) confirmations.push(`決策分較進場下降 ${Math.abs(input.decisionChangeFromEntry!).toFixed(1)} 分`);
  if (foreignWeak) confirmations.push(`外資續航降至 ${input.foreignPersistenceScore!.toFixed(0)}`);
  if (gradeBreakdown) confirmations.push("Swing10 已降為 C級且持有滿3日");
  if (priceWeak) confirmations.push(`價格較成本下跌 ${Math.abs(input.currentReturnPct!).toFixed(1)}%`);
  if (matureTop20Exit) confirmations.push("退出新進場 Top20 已達7日觀察門檻");
  if (noMomentum) confirmations.push(`${input.holdingDays} 日內最大漲幅未達 +${input.noMomentumMinPeakPct.toFixed(0)}%`);
  if (noiseHigh) confirmations.push(`當沖雜訊偏高 -${input.daytradeNoisePenalty!.toFixed(0)}`);

  // Strong paired condition: high beta risk + weak foreign participation.
  if (input.marketRiskLevel === "高" && foreignVeryWeak) {
    hardSell.push("大盤高風險且外資續航低於45");
  }

  // Signal-based red alert requires >=2 independent confirmations. This keeps
  // cases such as Day2 A→B + Decision -11.6 + foreign persistence 100 at WATCH.
  const confirmedSignalExit = confirmations.length >= 2;

  if (input.currentGrade === "A0") watch.push("目前為 A0 新機會，尚待跨日確認");
  else if (input.currentGrade !== "A1") watch.push(`目前級別 ${input.currentGrade}`);
  if (!input.inTop20) watch.push("已退出今日新進場 Top20，但持股分析仍持續");
  if (decisionWeak) watch.push(`決策分較進場下降 ${Math.abs(input.decisionChangeFromEntry!).toFixed(1)} 分，等待第二項確認`);
  else if (input.decisionChangeFromEntry != null && input.decisionChangeFromEntry <= -3) {
    watch.push(`決策分較進場下降 ${Math.abs(input.decisionChangeFromEntry).toFixed(1)} 分`);
  }
  if (foreignWeak) watch.push(`外資續航偏弱 ${input.foreignPersistenceScore!.toFixed(0)}`);
  if (input.marketRiskLevel === "高") watch.push("大盤風險高（僅作市場背景，不單獨觸發賣出）");
  if (noiseHigh) watch.push(`當沖雜訊偏高 -${input.daytradeNoisePenalty!.toFixed(0)}`);
  if (input.riskChangeLevel === "watch" || input.riskChangeLevel === "high") watch.push(`今日風險變化 ${input.riskChangeLevel}`);
  if (input.holdingDays >= 7) watch.push(`已持有 ${input.holdingDays} 日，進入 Time Stop 觀察區`);
  if (noMomentum) watch.push(`${input.holdingDays} 日內尚未明顯發動`);

  const sellReasons = hardSell.length
    ? hardSell
    : confirmedSignalExit
      ? [`多條件確認：${confirmations.slice(0, 4).join("＋")}`]
      : [];
  const action: Swing10ExitAction = sellReasons.length ? "sell_check" : watch.length ? "watch" : "hold";
  return {
    action,
    severity: action === "sell_check" ? "red" : action === "watch" ? "yellow" : "green",
    reasons: [...sellReasons, ...(sellReasons.length ? watch.slice(0, 3) : watch)].slice(0, 8),
    drawdownFromPeakPct: drawdown,
    confirmationCount: confirmations.length,
  };
}
