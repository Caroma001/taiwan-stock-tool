import type { PriceRow, RangeResult } from "@/services/analyzers/types";

function maxHigh(prices: PriceRow[]): number | null {
  const highs = prices
    .map((p) => p.high)
    .filter((v): v is number => typeof v === "number");

  if (highs.length === 0) return null;
  return Math.max(...highs);
}

function minLow(prices: PriceRow[]): number | null {
  const lows = prices
    .map((p) => p.low)
    .filter((v): v is number => typeof v === "number");

  if (lows.length === 0) return null;
  return Math.min(...lows);
}

export function analyzeRange(prices: PriceRow[]): RangeResult {
  return {
    high_60d: maxHigh(prices.slice(-60)),
    low_60d: minLow(prices.slice(-60)),
    high_240d: maxHigh(prices.slice(-240)),
    low_240d: minLow(prices.slice(-240)),
  };
}