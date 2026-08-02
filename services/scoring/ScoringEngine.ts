import type { IndicatorDbRow, AnalysisResult } from "./types";

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const n = (value: number | null) => typeof value === "number" && Number.isFinite(value) ? value : null;

export function scoreIndicator(row: IndicatorDbRow): AnalysisResult {
  const close = n(row.close);
  let trend = 0; const reasons: string[] = [];
  if (close !== null && row.ma20 !== null) { trend += close >= row.ma20 ? 10 : 2; reasons.push(close >= row.ma20 ? "收盤站上 MA20" : "收盤低於 MA20"); }
  if (row.ma5 !== null && row.ma20 !== null) trend += row.ma5 >= row.ma20 ? 8 : 2;
  if (row.ma20 !== null && row.ma60 !== null) trend += row.ma20 >= row.ma60 ? 7 : 1;
  if (row.ma60 !== null && row.ma240 !== null) trend += row.ma60 >= row.ma240 ? 5 : 1;
  trend = clamp(trend, 0, 30);

  let momentum = 0;
  if (row.rsi14 !== null) {
    if (row.rsi14 >= 50 && row.rsi14 <= 70) { momentum += 10; reasons.push("RSI 位於健康強勢區"); }
    else if (row.rsi14 > 70) momentum += 6; else if (row.rsi14 >= 35) momentum += 5;
  }
  if (row.k !== null && row.d !== null) momentum += row.k >= row.d ? 7 : 2;
  if (row.macd_histogram !== null) momentum += row.macd_histogram > 0 ? 8 : 1;
  momentum = clamp(momentum, 0, 25);

  let volume = 0;
  if (row.volume_ma5 !== null && row.volume_ma20 !== null) {
    const ratio = row.volume_ma20 === 0 ? 1 : row.volume_ma5 / row.volume_ma20;
    volume = clamp(10 + (ratio - 1) * 20, 0, 20);
    reasons.push(ratio >= 1.1 ? "短期成交量高於月均量" : "成交量尚未明顯放大");
  }

  let risk = 15;
  if (close !== null && row.atr14 !== null && close > 0) {
    const atrPct = row.atr14 / close;
    risk = clamp(25 - atrPct * 250, 0, 25);
    reasons.push(atrPct <= 0.04 ? "波動風險可控" : "波動偏高");
  }
  if (row.bollinger_upper !== null && close !== null && close > row.bollinger_upper) risk = clamp(risk - 5, 0, 25);

  const total = clamp(trend + momentum + volume + risk);
  const populated = [row.ma20,row.ma60,row.rsi14,row.k,row.d,row.macd_histogram,row.atr14].filter(v => v !== null).length;
  const confidence = clamp(45 + populated * 7, 0, 94);
  return { trendScore: trend, momentumScore: momentum, volumeScore: volume, riskScore: risk, totalScore: total, confidence, reasons };
}
