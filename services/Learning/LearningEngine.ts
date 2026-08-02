import type { DecisionWeights } from "@/services/Decision/types";

export type LearningSample = {
  trend_score: number;
  momentum_score: number;
  risk_score: number;
  ai_base_score: number;
  current_return_pct: number;
  max_gain_pct: number;
  max_drawdown_pct: number;
  status: string;
};

export type FactorEvidence = {
  factor: "trend" | "momentum" | "risk" | "aiBase";
  correlation: number;
  learnedWeight: number;
  sampleCount: number;
};

export type LearningResult = {
  weights: DecisionWeights;
  evidence: FactorEvidence[];
  sampleCount: number;
  settledCount: number;
  message: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pearson(xs: number[], ys: number[]): number {
  if (xs.length < 3 || xs.length !== ys.length) return 0;
  const xMean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const yMean = ys.reduce((a, b) => a + b, 0) / ys.length;
  let numerator = 0;
  let xVariance = 0;
  let yVariance = 0;
  for (let i = 0; i < xs.length; i += 1) {
    const dx = xs[i] - xMean;
    const dy = ys[i] - yMean;
    numerator += dx * dy;
    xVariance += dx * dx;
    yVariance += dy * dy;
  }
  const denominator = Math.sqrt(xVariance * yVariance);
  return denominator > 0 ? numerator / denominator : 0;
}

function performance(sample: LearningSample): number {
  const terminalBonus =
    sample.status === "target_2"
      ? 8
      : sample.status === "target_1"
        ? 4
        : sample.status === "stop_loss"
          ? -8
          : 0;
  return clamp(
    sample.current_return_pct + sample.max_gain_pct * 0.25 + sample.max_drawdown_pct * 0.2 + terminalBonus,
    -25,
    35,
  );
}

export function learnWeights(samples: LearningSample[], current: DecisionWeights): LearningResult {
  const eligible = samples.filter((sample) => Number.isFinite(sample.current_return_pct));
  const settled = eligible.filter((sample) => sample.status !== "tracking");
  const training = settled.length >= 20 ? settled : eligible;

  if (training.length < 20) {
    return {
      weights: current,
      evidence: [],
      sampleCount: eligible.length,
      settledCount: settled.length,
      message: `樣本不足：目前 ${training.length} 筆，至少需要 20 筆才會調整權重。`,
    };
  }

  const ys = training.map(performance);
  const definitions = [
    { factor: "trend" as const, values: training.map((s) => s.trend_score / 30) },
    { factor: "momentum" as const, values: training.map((s) => s.momentum_score / 25) },
    { factor: "risk" as const, values: training.map((s) => s.risk_score / 25) },
    { factor: "aiBase" as const, values: training.map((s) => s.ai_base_score / 100) },
  ];

  const correlations = definitions.map((definition) => ({
    factor: definition.factor,
    correlation: clamp(pearson(definition.values, ys), -1, 1),
  }));

  const evidenceStrength = correlations.map((item) => clamp(1 + item.correlation, 0.25, 1.75));
  const strengthTotal = evidenceStrength.reduce((sum, value) => sum + value, 0);
  const learnedRaw = evidenceStrength.map((value) => value / strengthTotal);

  // 只進行溫和學習：新權重 20%，既有權重 80%，避免少量樣本造成劇烈漂移。
  const old = [current.trend, current.momentum, current.risk, current.aiBase];
  const blended = old.map((value, index) => clamp(value * 0.8 + learnedRaw[index] * 0.2, 0.1, 0.4));
  const blendedTotal = blended.reduce((sum, value) => sum + value, 0);
  const normalized = blended.map((value) => value / blendedTotal);
  const version = `M5.0-learned-${new Date().toISOString().slice(0, 10)}-${Date.now()}`;

  const weights: DecisionWeights = {
    trend: normalized[0],
    momentum: normalized[1],
    risk: normalized[2],
    aiBase: normalized[3],
    version,
    source: "learned",
  };

  return {
    weights,
    evidence: correlations.map((item, index) => ({
      factor: item.factor,
      correlation: Number(item.correlation.toFixed(4)),
      learnedWeight: Number(normalized[index].toFixed(4)),
      sampleCount: training.length,
    })),
    sampleCount: eligible.length,
    settledCount: settled.length,
    message: `已使用 ${training.length} 筆驗證樣本進行溫和權重更新。`,
  };
}
