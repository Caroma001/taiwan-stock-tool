import { DecisionResult } from "./DecisionEngine";

export type DecisionCard = {
  title: string;
  subtitle: string;
  action: string;
  position: number;
  stars: number;
  reasons: string[];
  risks: string[];
  nextStep: string;
};

export function buildDecisionCard(
  decision: DecisionResult,
  context?: {
    ma20Up?: boolean;
    ma60Up?: boolean;
    volumeExpand?: boolean;
    foreignBuy?: boolean;
    nearResistance?: boolean;
  }
): DecisionCard {

  const reasons: string[] = [];
  const risks: string[] = [];

  if (context?.ma20Up)
    reasons.push("MA20 向上突破");

  if (context?.ma60Up)
    reasons.push("MA60 多頭排列");

  if (context?.volumeExpand)
    reasons.push("成交量放大");

  if (context?.foreignBuy)
    reasons.push("外資連續買超");

  if (context?.nearResistance)
    risks.push("接近短線壓力區");

  let stars = 1;

  if (decision.confidence >= 90) stars = 5;
  else if (decision.confidence >= 80) stars = 4;
  else if (decision.confidence >= 65) stars = 3;
  else if (decision.confidence >= 50) stars = 2;

  return {
    title: decision.title,

    subtitle:
      decision.level === "BUY"
        ? "AI 建議開始布局"
        : decision.level === "HOLD"
        ? "AI 建議續抱"
        : decision.level === "WAIT"
        ? "等待更好的進場點"
        : "目前不建議介入",

    action: decision.action,

    position: decision.position,

    stars,

    reasons,

    risks,

    nextStep:
      decision.level === "BUY"
        ? "突破壓力可考慮增加部位"
        : decision.level === "HOLD"
        ? "續抱並觀察量能"
        : decision.level === "WAIT"
        ? "等待突破 MA20"
        : "等待 AI 重新評估",
  };
}