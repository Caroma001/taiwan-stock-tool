import type { MAResult } from "@/services/analyzers/types";

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Number((values.reduce((sum, v) => sum + v, 0) / values.length).toFixed(2));
}

function movingAverage(closes: number[], days: number): number | null {
  if (closes.length < days) return null;
  return average(closes.slice(-days));
}

export function analyzeMovingAverage(closes: number[]): MAResult {
  return {
    ma5: movingAverage(closes, 5),
    ma10: movingAverage(closes, 10),
    ma20: movingAverage(closes, 20),
    ma60: movingAverage(closes, 60),
    ma120: movingAverage(closes, 120),
    ma240: movingAverage(closes, 240),
  };
}