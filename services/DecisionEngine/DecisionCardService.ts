import { buildDecisionCard } from "./DecisionCard";
import { makeDecision } from "./DecisionEngine";

export type DecisionCardInput = {
  aiScore: number | null;

  trendScore?: number | null;
  volumeScore?: number | null;
  foreignScore?: number | null;

  ma20?: number | null;
  ma60?: number | null;

  latestClose?: number | null;

  volume20?: number | null;
  volume5?: number | null;

  resistance?: number | null;
};

export function createDecisionCard(input: DecisionCardInput) {

  const decision = makeDecision({
    aiScore: input.aiScore,
    trendScore: input.trendScore,
    volumeScore: input.volumeScore,
    foreignScore: input.foreignScore,
  });

  const card = buildDecisionCard(decision, {

    ma20Up:
      input.latestClose != null &&
      input.ma20 != null &&
      input.latestClose > input.ma20,

    ma60Up:
      input.latestClose != null &&
      input.ma60 != null &&
      input.latestClose > input.ma60,

    volumeExpand:
      input.volume5 != null &&
      input.volume20 != null &&
      input.volume5 > input.volume20,

    foreignBuy:
      (input.foreignScore ?? 0) >= 60,

    nearResistance:
      input.latestClose != null &&
      input.resistance != null &&
      input.latestClose >= input.resistance * 0.97,
  });

  return card;
}