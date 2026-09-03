export type HolderBand = "retail" | "medium" | "large" | "super" | "ignore";

export type DistributionLevelRowLike = {
  symbol: string; reportDate: string; level: string; people: number; shares: number; percent: number; source: string;
};

export type DistributionSummary = {
  retailTierPct: number;
  mediumHolderPct: number;
  largeHolderPct: number;
  superHolderPct: number;
  retailProxyPct: number;
  shareholderCount: number;
  distributionTotalPct: number;
  valid: boolean;
  validationMessage: string;
  acceptedRows: number;
  ignoredRows: number;
};

const TDCC_LEVEL_CODE: Record<string, string> = {
  "1": "1-999",
  "2": "1000-5000",
  "3": "5001-10000",
  "4": "10001-15000",
  "5": "15001-20000",
  "6": "20001-30000",
  "7": "30001-40000",
  "8": "40001-50000",
  "9": "50001-100000",
  "10": "100001-200000",
  "11": "200001-400000",
  "12": "400001-600000",
  "13": "600001-800000",
  "14": "800001-1000000",
  "15": "1000001以上",
  // TDCC 定義：16 為差異調整，17 為合計。兩者都不能納入級距加總。
  "16": "IGNORE_ADJUSTMENT",
  "17": "IGNORE_TOTAL",
};

function canonicalLevel(raw: string) {
  const compact = String(raw ?? "")
    .trim()
    .replace(/[，,]/g, "")
    .replace(/[～~至]/g, "-")
    .replace(/股/g, "")
    .replace(/\s+/g, "");
  return TDCC_LEVEL_CODE[compact] ?? compact;
}

export function classifyHoldingLevel(raw: string): HolderBand {
  const level = canonicalLevel(raw);
  if (!level || /IGNORE_|合計|total|差異|調整|adjust/i.test(level)) return "ignore";

  const values = (level.match(/\d+/g) ?? []).map(Number).filter(Number.isFinite);
  if (!values.length) return "ignore";
  const lower = values[0] ?? 0;
  const upper = /以上/.test(level) ? Number.POSITIVE_INFINITY : (values[1] ?? lower);

  // 400 張 = 400,000 股；本專案將 400,001 股以上視為「大戶」。
  if (lower >= 1_000_001) return "super";
  if (lower >= 400_001) return "large";
  if (lower >= 50_001) return "medium";
  if (upper <= 50_000 || lower <= 50_000) return "retail";
  return "ignore";
}

const round = (value: number, digits = 4) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export function aggregateDistribution(rows: DistributionLevelRowLike[]): DistributionSummary {
  let retailTierPct = 0;
  let mediumHolderPct = 0;
  let largeOnlyPct = 0;
  let superHolderPct = 0;
  let shareholderCount = 0;
  let distributionTotalPct = 0;
  let acceptedRows = 0;
  let ignoredRows = 0;

  for (const row of rows) {
    const band = classifyHoldingLevel(row.level);
    const pct = Number(row.percent);
    const people = Number(row.people);
    if (band === "ignore" || !Number.isFinite(pct) || pct < 0) {
      ignoredRows += 1;
      continue;
    }
    acceptedRows += 1;
    distributionTotalPct += pct;
    if (Number.isFinite(people) && people >= 0) shareholderCount += people;

    if (band === "retail") retailTierPct += pct;
    else if (band === "medium") mediumHolderPct += pct;
    else if (band === "large") largeOnlyPct += pct;
    else if (band === "super") superHolderPct += pct;
  }

  const largeHolderPct = largeOnlyPct + superHolderPct;
  const retailProxyPct = 100 - largeHolderPct;

  // 15 個正式持股級距通常應全部存在。為容忍極少數 0 人級距缺列，最低接受 12 段。
  const totalValid = acceptedRows >= 12 && distributionTotalPct >= 98 && distributionTotalPct <= 102;
  const ratioValid = largeHolderPct >= 0 && largeHolderPct <= 100 && retailProxyPct >= 0 && retailProxyPct <= 100;
  const complementValid = Math.abs((largeHolderPct + retailProxyPct) - 100) <= 0.05;
  const valid = totalValid && ratioValid && complementValid;

  let validationMessage = "OK";
  if (!acceptedRows) validationMessage = "沒有可辨識的 TDCC 持股級距";
  else if (acceptedRows < 12) validationMessage = `有效持股級距只有 ${acceptedRows} 段，資料不完整`;
  else if (!totalValid) validationMessage = `持股級距比例合計 ${round(distributionTotalPct, 2)}%，應接近 100%`;
  else if (!ratioValid) validationMessage = "大戶/散戶比例超出 0–100% 範圍";
  else if (!complementValid) validationMessage = "大戶與散戶比例未能互補為 100%";

  return {
    retailTierPct: round(retailTierPct),
    mediumHolderPct: round(mediumHolderPct),
    largeHolderPct: round(largeHolderPct),
    superHolderPct: round(superHolderPct),
    retailProxyPct: round(retailProxyPct),
    shareholderCount,
    distributionTotalPct: round(distributionTotalPct),
    valid,
    validationMessage,
    acceptedRows,
    ignoredRows,
  };
}

export function ownershipCompleteness(input: {
  foreignHoldingPct: number | null;
  trust10: number | null;
  largeHolderPct: number | null;
  retailProxyPct: number | null;
  distributionValid: boolean;
}) {
  const checks = [
    input.foreignHoldingPct != null,
    input.trust10 != null,
    input.largeHolderPct != null && input.distributionValid,
    input.retailProxyPct != null && input.distributionValid,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
