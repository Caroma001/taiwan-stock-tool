import type { DatabaseRow } from "@/lib/database";

export type Winner25PriceRow = {
  symbol: string;
  trade_date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  turnover: number | null;
};

export type Winner25Features = Record<string, number | null>;

export type InstitutionalPoint = {
  tradeDate: string;
  foreignNetShares: number | null;
  trustNetShares: number | null;
  foreignHoldingPct: number | null;
};

export type DistributionPoint = {
  reportDate: string;
  largeHolderPct: number | null;
  retailPct: number | null;
};

const num = (v: unknown): number | null => {
  if (v == null) return null;
  const value = Number(v);
  return Number.isFinite(value) ? value : null;
};

const mean = (values: number[]) => values.length ? values.reduce((a,b)=>a+b,0) / values.length : null;
const pct = (from: number | null, to: number | null) => from && to != null ? ((to / from) - 1) * 100 : null;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function stddev(values: number[]) {
  if (values.length < 2) return null;
  const m = mean(values);
  if (m == null) return null;
  const variance = values.reduce((sum,v)=>sum + (v-m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function sliceNumbers(rows: Winner25PriceRow[], start: number, end: number, key: "close"|"high"|"low"|"volume"|"turnover") {
  return rows.slice(Math.max(0,start), Math.max(0,end)).map(r=>num(r[key])).filter((v): v is number => v != null);
}

function latestInstitutional(points: InstitutionalPoint[], date: string) {
  let latest: InstitutionalPoint | null = null;
  for (const point of points) {
    if (point.tradeDate > date) break;
    latest = point;
  }
  return latest;
}

function latestDistribution(points: DistributionPoint[], date: string) {
  let latest: DistributionPoint | null = null;
  for (const point of points) {
    if (point.reportDate > date) break;
    latest = point;
  }
  return latest;
}

function distributionAgo(points: DistributionPoint[], date: string, weeks: number) {
  const eligible = points.filter(p=>p.reportDate <= date);
  return eligible.length > weeks ? eligible[eligible.length - 1 - weeks] : null;
}

export function normalizePriceRows(rows: readonly DatabaseRow[]): Winner25PriceRow[] {
  return rows.map(row=>({
    symbol: String(row.symbol ?? ""),
    trade_date: String(row.trade_date ?? ""),
    open: num(row.open), high: num(row.high), low: num(row.low), close: num(row.close),
    volume: num(row.volume), turnover: num(row.turnover),
  })).filter(row=>row.symbol && row.trade_date && row.close != null && row.close > 0);
}

export function normalizeInstitutionalRows(rows: readonly DatabaseRow[]): InstitutionalPoint[] {
  return rows.map(row=>({
    tradeDate: String(row.trade_date ?? ""),
    foreignNetShares: num(row.foreign_net_shares),
    trustNetShares: num(row.trust_net_shares),
    foreignHoldingPct: num(row.foreign_holding_pct),
  })).filter(row=>row.tradeDate).sort((a,b)=>a.tradeDate.localeCompare(b.tradeDate));
}

export function normalizeDistributionRows(rows: readonly DatabaseRow[]): DistributionPoint[] {
  return rows.map(row=>({
    reportDate: String(row.report_date ?? ""),
    largeHolderPct: num(row.large_holder_pct),
    retailPct: num(row.retail_proxy_pct),
  })).filter(row=>row.reportDate).sort((a,b)=>a.reportDate.localeCompare(b.reportDate));
}

export function calculateWinner25Features(
  prices: Winner25PriceRow[],
  index: number,
  institutional: InstitutionalPoint[] = [],
  distribution: DistributionPoint[] = [],
): Winner25Features | null {
  if (index < 60 || index >= prices.length) return null;
  const current = prices[index];
  const close = current.close;
  if (close == null || close <= 0) return null;

  const closeAt = (offset: number) => num(prices[index-offset]?.close);
  const closes20 = sliceNumbers(prices,index-19,index+1,"close");
  const closes60 = sliceNumbers(prices,index-59,index+1,"close");
  const volumes5 = sliceNumbers(prices,index-4,index+1,"volume");
  const volumes20 = sliceNumbers(prices,index-19,index+1,"volume");
  const turnovers5 = sliceNumbers(prices,index-4,index+1,"turnover");
  const turnovers20 = sliceNumbers(prices,index-19,index+1,"turnover");

  const ma20 = mean(closes20);
  const ma60 = mean(closes60);
  const prevMa20 = mean(sliceNumbers(prices,index-24,index-4,"close"));
  const prevMa60 = mean(sliceNumbers(prices,index-69,index-9,"close"));
  const high20 = Math.max(...closes20);
  const high60 = Math.max(...closes60);
  const low20 = Math.min(...closes20);
  const avgVol5 = mean(volumes5);
  const avgVol20 = mean(volumes20);
  const avgTurnover5 = mean(turnovers5);
  const avgTurnover20 = mean(turnovers20);

  const dailyReturns: number[] = [];
  for (let i=Math.max(1,index-19); i<=index; i++) {
    const a = num(prices[i-1]?.close), b = num(prices[i]?.close);
    if (a && b != null) dailyReturns.push(((b/a)-1)*100);
  }

  const instEligible = institutional.filter(p=>p.tradeDate <= current.trade_date);
  // M8.10.23 — local completeness repair.
  // institutional_holding_daily also contains foreign-holding enrichment rows
  // whose net-flow fields are intentionally NULL. Those rows are not missing
  // trading days and must not push valid 5-day flow values out of the window.
  // Build 5/10/20-day sums from the latest VALID net-flow observations instead.
  // Zero is a valid observation and is preserved; only NULL enrichment values
  // are skipped. This keeps the repair fully local—no FinMind/API retry.
  const sumField = (days: number, key: "foreignNetShares"|"trustNetShares") => {
    const values = instEligible
      .map(r=>r[key])
      .filter((v):v is number=>v!=null && Number.isFinite(v));
    const rows = values.slice(-days);
    return rows.length >= Math.min(days,5) ? rows.reduce((a,b)=>a+b,0) : null;
  };
  const adv20 = avgVol20 && avgVol20 > 0 ? avgVol20 : null;
  const foreign5 = sumField(5,"foreignNetShares");
  const foreign10 = sumField(10,"foreignNetShares");
  const foreign20 = sumField(20,"foreignNetShares");
  const trust5 = sumField(5,"trustNetShares");
  const trust10 = sumField(10,"trustNetShares");
  const trust20 = sumField(20,"trustNetShares");
  const instNow = latestInstitutional(institutional,current.trade_date);
  const inst20Ago = instEligible.length > 20 ? instEligible[instEligible.length-21] : null;

  const distNow = latestDistribution(distribution,current.trade_date);
  const dist4w = distributionAgo(distribution,current.trade_date,4);

  return {
    ret5: pct(closeAt(5), close),
    ret10: pct(closeAt(10), close),
    ret20: pct(closeAt(20), close),
    closeVsMa20Pct: ma20 ? ((close/ma20)-1)*100 : null,
    closeVsMa60Pct: ma60 ? ((close/ma60)-1)*100 : null,
    ma20Slope5Pct: prevMa20 && ma20 ? ((ma20/prevMa20)-1)*100 : null,
    ma60Slope10Pct: prevMa60 && ma60 ? ((ma60/prevMa60)-1)*100 : null,
    distanceTo20HighPct: high20 ? ((close/high20)-1)*100 : null,
    distanceTo60HighPct: high60 ? ((close/high60)-1)*100 : null,
    drawdown20Pct: high20 ? ((close/high20)-1)*100 : null,
    range20Pct: close ? ((high20-low20)/close)*100 : null,
    volatility20Pct: stddev(dailyReturns),
    volume5Over20: avgVol5 != null && avgVol20 ? avgVol5/avgVol20 : null,
    volumeTodayOver20: current.volume != null && avgVol20 ? current.volume/avgVol20 : null,
    turnover5Over20: avgTurnover5 != null && avgTurnover20 ? avgTurnover5/avgTurnover20 : null,
    foreign5AdvPct: foreign5 != null && adv20 ? (foreign5/adv20)*100 : null,
    foreign10AdvPct: foreign10 != null && adv20 ? (foreign10/adv20)*100 : null,
    foreign20AdvPct: foreign20 != null && adv20 ? (foreign20/adv20)*100 : null,
    trust5AdvPct: trust5 != null && adv20 ? (trust5/adv20)*100 : null,
    trust10AdvPct: trust10 != null && adv20 ? (trust10/adv20)*100 : null,
    trust20AdvPct: trust20 != null && adv20 ? (trust20/adv20)*100 : null,
    foreignHoldingPct: instNow?.foreignHoldingPct ?? null,
    foreignHolding20dChange: instNow?.foreignHoldingPct != null && inst20Ago?.foreignHoldingPct != null
      ? instNow.foreignHoldingPct - inst20Ago.foreignHoldingPct : null,
    largeHolderPct: distNow?.largeHolderPct ?? null,
    retailPct: distNow?.retailPct ?? null,
    largeHolder4wChange: distNow?.largeHolderPct != null && dist4w?.largeHolderPct != null
      ? distNow.largeHolderPct - dist4w.largeHolderPct : null,
    retail4wChange: distNow?.retailPct != null && dist4w?.retailPct != null
      ? distNow.retailPct - dist4w.retailPct : null,
  };
}

export const WINNER25_FEATURE_LABELS: Record<string,string> = {
  ret5: "前5日漲跌", ret10: "前10日漲跌", ret20: "前20日漲跌",
  closeVsMa20Pct: "收盤相對MA20", closeVsMa60Pct: "收盤相對MA60",
  ma20Slope5Pct: "MA20近5日斜率", ma60Slope10Pct: "MA60近10日斜率",
  distanceTo20HighPct: "距20日高點", distanceTo60HighPct: "距60日高點",
  drawdown20Pct: "20日回撤", range20Pct: "20日區間振幅", volatility20Pct: "20日波動",
  volume5Over20: "5日/20日均量倍率", volumeTodayOver20: "今日/20日均量倍率", turnover5Over20: "5日/20日成交額倍率",
  foreign5AdvPct: "外資5日/20日均量", foreign10AdvPct: "外資10日/20日均量", foreign20AdvPct: "外資20日/20日均量",
  trust5AdvPct: "投信5日/20日均量", trust10AdvPct: "投信10日/20日均量", trust20AdvPct: "投信20日/20日均量",
  foreignHoldingPct: "外資持股比例", foreignHolding20dChange: "外資持股20日變化",
  largeHolderPct: "大戶比例", retailPct: "散戶比例", largeHolder4wChange: "大戶4週變化", retail4wChange: "散戶4週變化",
};

export function boundedScore(value: number) { return clamp(value,0,100); }
