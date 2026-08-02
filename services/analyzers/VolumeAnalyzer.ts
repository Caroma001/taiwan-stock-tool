import type { VolumeResult } from "@/services/analyzers/types";

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Number((values.reduce((sum, v) => sum + v, 0) / values.length).toFixed(2));
}

export function analyzeVolume(volumes: number[]): VolumeResult {
  const volume5 = average(volumes.slice(-5));
  const volume20 = average(volumes.slice(-20));

  let volume_score = 50;

  if (volume5 && volume20 && volume5 > volume20 * 1.2) volume_score += 20;
  if (volume5 && volume20 && volume5 < volume20 * 0.8) volume_score -= 10;

  volume_score = Math.max(0, Math.min(100, volume_score));

  return {
    volume_score,
    volume5,
    volume20,
  };
}