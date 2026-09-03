export type OwnershipScoreInput = {
  foreignHoldingPct: number | null;
  largeHolderPct: number | null;
  retailPct: number | null;
  distributionValid: boolean;
};

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

/**
 * M8.10.2 股權結構分數 2.0
 * - 外資持股 40%：40% 持股視為 100 分上限，避免大型權值股比例直接壓過其他因子。
 * - 大戶比例 40%：直接使用 TDCC 400,001 股以上的持股比例。
 * - 散戶反向 20%：100 - 散戶比例。散戶比例目前與大戶比例互補，因此此項是集中度的輔助確認。
 *
 * 缺資料時不虛構：缺少的因子以 0 分計入固定權重，因此資料不完整不會取得滿分。
 */
export function calculateOwnershipStructureScore(input: OwnershipScoreInput) {
  const foreignSubscore = input.foreignHoldingPct == null
    ? 0
    : clamp((input.foreignHoldingPct / 40) * 100);

  const distributionAvailable = input.distributionValid
    && input.largeHolderPct != null
    && input.retailPct != null;

  const largeHolderSubscore = distributionAvailable ? clamp(input.largeHolderPct as number) : 0;
  const retailInverseSubscore = distributionAvailable ? clamp(100 - (input.retailPct as number)) : 0;

  const score = clamp(
    foreignSubscore * 0.40
    + largeHolderSubscore * 0.40
    + retailInverseSubscore * 0.20,
  );

  return {
    score: Math.round(score * 10) / 10,
    foreignSubscore: Math.round(foreignSubscore * 10) / 10,
    largeHolderSubscore: Math.round(largeHolderSubscore * 10) / 10,
    retailInverseSubscore: Math.round(retailInverseSubscore * 10) / 10,
  };
}

export function sharesToLots(shares: number | null | undefined) {
  if (shares == null || !Number.isFinite(Number(shares))) return null;
  return Number(shares) / 1000;
}
