export type AnalysisInput = {
  symbol: string;
  stockName: string;
  latest: Record<string, number | string | null>;
  previous: Record<string, number | string | null> | null;
  latestVolume: number | null;
};

export type AIAnalysisRow = {
  symbol: string;
  trade_date: string;
  stock_name: string;
  close: number | null;
  total_score: number;
  trend_score: number;
  momentum_score: number;
  volume_score: number;
  volatility_score: number;
  setup_score: number;
  recommendation: "strong_watch" | "watch" | "neutral" | "caution" | "avoid";
  risk_level: "low" | "medium" | "high";
  reasons: string[];
  warnings: string[];
  snapshot: Record<string, number | string | null>;
  model_version: string;
  analyzed_at: string;
  updated_at: string;
};

const num = (value: unknown): number | null => {
  const n = Number(value);
  return value === null || value === undefined || !Number.isFinite(n) ? null : n;
};
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(n)));

export function analyzeStock(input: AnalysisInput): AIAnalysisRow {
  const i = input.latest;
  const p = input.previous;
  const close=num(i.close), ma5=num(i.ma5), ma10=num(i.ma10), ma20=num(i.ma20), ma60=num(i.ma60), ma120=num(i.ma120), ma240=num(i.ma240);
  const rsi=num(i.rsi14),
    k=num(i.k ?? i.k9),
    d=num(i.d ?? i.d9),
    hist=num(i.macd_histogram),
    prevHist=num(p?.macd_histogram);
  const upper=num(i.bollinger_upper), lower=num(i.bollinger_lower), atr=num(i.atr14), vma5=num(i.volume_ma5), vma20=num(i.volume_ma20);
  const reasons:string[]=[]; const warnings:string[]=[];

  let trend=0;
  if (close!==null && ma20!==null && close>ma20) { trend+=6; reasons.push("收盤站上 MA20"); }
  if (ma5!==null&&ma20!==null&&ma5>ma20) { trend+=6; reasons.push("MA5 高於 MA20"); }
  if (ma20!==null&&ma60!==null&&ma20>ma60) { trend+=7; reasons.push("MA20 高於 MA60"); }
  if (ma60!==null&&ma240!==null&&ma60>ma240) { trend+=7; reasons.push("中長期均線偏多"); }
  if (ma5!==null&&ma10!==null&&ma20!==null&&ma5>ma10&&ma10>ma20) trend+=4;
  trend=clamp(trend,0,30);

  let momentum=0;
  if (rsi!==null) {
    if (rsi>=45&&rsi<=68) { momentum+=9; reasons.push("RSI 位於健康強勢區"); }
    else if (rsi>68&&rsi<=78) { momentum+=5; warnings.push("RSI 偏高，留意追價風險"); }
    else if (rsi<30) { momentum+=3; warnings.push("RSI 超賣，但趨勢可能仍弱"); }
  }
  if (k!==null&&d!==null) {
    if (k>d&&k<85) { momentum+=7; reasons.push("KD 維持多方"); }
    if (k>85) warnings.push("KD 高檔鈍化或過熱");
  }
  if (hist!==null) {
    if (hist>0) { momentum+=6; reasons.push("MACD 柱為正"); }
    if (prevHist!==null&&hist>prevHist) { momentum+=3; reasons.push("MACD 動能增強"); }
  }
  momentum=clamp(momentum,0,25);

  let volume=5;
  if (input.latestVolume!==null&&vma20!==null&&vma20>0) {
    const ratio=input.latestVolume/vma20;
    if (ratio>=1.2&&ratio<=2.5) { volume=13; reasons.push("成交量高於 20 日均量"); }
    else if (ratio>2.5) { volume=9; warnings.push("成交量急增，留意短線震盪"); }
    else if (ratio>=0.75) volume=8;
    else { volume=4; warnings.push("量能偏低"); }
  } else if (vma5!==null&&vma20!==null&&vma5>vma20) { volume=10; reasons.push("短期均量高於月均量"); }
  volume=clamp(volume,0,15);

  let volatility=10;
  if (close!==null&&atr!==null&&close>0) {
    const atrPct=atr/close*100;
    if (atrPct<=2.5) { volatility=15; reasons.push("波動度相對穩定"); }
    else if (atrPct<=4.5) volatility=11;
    else if (atrPct<=7) { volatility=7; warnings.push("波動度偏高"); }
    else { volatility=3; warnings.push("ATR 顯示高波動風險"); }
  }

  let setup=3;
  if (close!==null&&upper!==null&&lower!==null&&upper>lower) {
    const pos=(close-lower)/(upper-lower);
    if (pos>=0.55&&pos<=0.85) { setup+=7; reasons.push("價格位於布林中上軌健康區"); }
    else if (pos>0.85&&pos<=1.05) { setup+=5; warnings.push("接近布林上軌，需確認突破有效性"); }
    else if (pos<0.25) warnings.push("價格接近布林下軌");
  }
  if (close!==null&&ma5!==null&&ma20!==null&&close>=ma5&&ma5>=ma20) setup+=5;
  setup=clamp(setup,0,15);

  const total=clamp(trend+momentum+volume+volatility+setup,0,100);
  let recommendation:AIAnalysisRow["recommendation"]="avoid";
  if(total>=80) recommendation="strong_watch"; else if(total>=68) recommendation="watch"; else if(total>=52) recommendation="neutral"; else if(total>=38) recommendation="caution";
  const atrPct=close&&atr ? atr/close*100 : null;
  const risk_level:AIAnalysisRow["risk_level"] = atrPct!==null&&atrPct>6 ? "high" : (total<45 || warnings.length>=3 ? "medium" : "low");
  if (total>=68) warnings.push("評分僅供觀察排序，不等同買進訊號");

  const now=new Date().toISOString();
  return { symbol:input.symbol, trade_date:String(i.trade_date), stock_name:input.stockName, close,
    total_score:total, trend_score:trend, momentum_score:momentum, volume_score:volume,
    volatility_score:volatility, setup_score:setup, recommendation, risk_level,
    reasons:reasons.slice(0,8), warnings:warnings.slice(0,6),
    snapshot:{ma5,ma10,ma20,ma60,ma120,ma240,rsi14:rsi,k9:k,d9:d,macd_histogram:hist,bollinger_upper:upper,bollinger_lower:lower,atr14:atr,latest_volume:input.latestVolume,volume_ma20:vma20},
    model_version:"M4.0-rule-v1", analyzed_at:now, updated_at:now };
}
