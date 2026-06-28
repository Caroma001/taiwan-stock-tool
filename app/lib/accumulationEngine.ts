export type PriceRow = {
    trade_date: string;
    close: number | null;
    volume?: number | null;
  };
  
  export type ForeignRow = {
    trade_date: string;
    buy_sell?: number | null;
    foreign_buy?: number | null;
    foreign_buy_sell?: number | null;
    net_buy_sell?: number | null;
  };
  
  export type AccumulationResult = {
    foreignBuy20: number;
    foreignBuy10: number;
    foreignBuy5: number;
    foreignDays: number;
    priceChange20: number | null;
    priceChange10: number | null;
    absorptionEfficiency: number;
    consistencyScore: number;
    accumulationScore: number;
    stars: number;
    signal: string;
    reason: string;
  };
  
  function n(value: unknown): number {
    const num = Number(value ?? 0);
    return Number.isFinite(num) ? num : 0;
  }
  
  function getForeignBuy(row: ForeignRow): number {
    return n(
      row.buy_sell ??
        row.foreign_buy ??
        row.foreign_buy_sell ??
        row.net_buy_sell ??
        0
    );
  }
  
  function pctChange(now: number, before: number): number | null {
    if (!before || before <= 0) return null;
    return ((now - before) / before) * 100;
  }
  
  function clamp(value: number, min = 0, max = 100): number {
    return Math.max(min, Math.min(max, value));
  }
  
  function scoreForeignAmount(foreignBuy20: number): number {
    if (foreignBuy20 <= 0) return 0;
    if (foreignBuy20 >= 10000) return 35;
    if (foreignBuy20 >= 5000) return 30;
    if (foreignBuy20 >= 3000) return 24;
    if (foreignBuy20 >= 1000) return 18;
    if (foreignBuy20 >= 500) return 12;
    return 6;
  }
  
  function scoreForeignDays(days: number): number {
    if (days >= 10) return 20;
    if (days >= 8) return 17;
    if (days >= 6) return 14;
    if (days >= 4) return 10;
    if (days >= 2) return 5;
    return 0;
  }
  
  function scorePriceMuted(priceChange20: number | null): number {
    if (priceChange20 === null) return 0;
  
    // 核心：外資買，但價格不要大漲
    if (priceChange20 <= 0) return 25;
    if (priceChange20 <= 3) return 24;
    if (priceChange20 <= 5) return 20;
    if (priceChange20 <= 8) return 14;
    if (priceChange20 <= 12) return 8;
    return 0;
  }
  
  function scoreConsistency(foreignRows20: ForeignRow[]): number {
    if (!foreignRows20.length) return 0;
  
    const buyDays = foreignRows20.filter((r) => getForeignBuy(r) > 0).length;
    const ratio = buyDays / foreignRows20.length;
  
    if (ratio >= 0.75) return 15;
    if (ratio >= 0.6) return 12;
    if (ratio >= 0.5) return 9;
    if (ratio >= 0.4) return 5;
    return 0;
  }
  
  function scoreAbsorptionEfficiency(
    foreignBuy20: number,
    priceChange20: number | null
  ): number {
    if (foreignBuy20 <= 0 || priceChange20 === null) return 0;
  
    const priceMove = Math.max(Math.abs(priceChange20), 1);
    const efficiency = foreignBuy20 / priceMove;
  
    if (priceChange20 > 12) return 0;
    if (efficiency >= 3000) return 20;
    if (efficiency >= 1500) return 16;
    if (efficiency >= 800) return 12;
    if (efficiency >= 300) return 8;
    return 4;
  }
  
  function starsFromScore(score: number): number {
    if (score >= 85) return 5;
    if (score >= 70) return 4;
    if (score >= 55) return 3;
    if (score >= 40) return 2;
    return 1;
  }
  
  function signalFromScore(score: number): string {
    if (score >= 85) return "★★★★★ 外資吸籌明顯";
    if (score >= 70) return "★★★★☆ 外資布局中";
    if (score >= 55) return "★★★☆☆ 可觀察";
    if (score >= 40) return "★★☆☆☆ 訊號偏弱";
    return "★☆☆☆☆ 暫不列入";
  }
  
  function buildReason(params: {
    foreignBuy20: number;
    foreignDays: number;
    priceChange20: number | null;
    absorptionEfficiency: number;
    consistencyScore: number;
  }): string {
    const reasons: string[] = [];
  
    if (params.foreignBuy20 > 0) {
      reasons.push(`近20日外資累計買超 ${params.foreignBuy20.toLocaleString()} 張`);
    } else {
      reasons.push("近20日外資未明顯買超");
    }
  
    reasons.push(`近20日外資買超天數 ${params.foreignDays} 天`);
  
    if (params.priceChange20 !== null) {
      reasons.push(`近20日股價變化 ${params.priceChange20.toFixed(2)}%`);
    }
  
    if (params.foreignBuy20 > 0 && params.priceChange20 !== null) {
      if (params.priceChange20 <= 5) {
        reasons.push("符合外資買進但股價尚未明顯反應");
      } else if (params.priceChange20 > 12) {
        reasons.push("股價已明顯上漲，可能已部分反映");
      }
    }
  
    if (params.consistencyScore >= 12) {
      reasons.push("外資買盤連續性佳");
    }
  
    if (params.absorptionEfficiency >= 1500) {
      reasons.push("吸籌效率佳");
    }
  
    return reasons.join("；");
  }
  
  export function calculateAccumulationScore(params: {
    prices: PriceRow[];
    foreignRows: ForeignRow[];
  }): AccumulationResult {
    const prices = [...params.prices].sort((a, b) =>
      a.trade_date.localeCompare(b.trade_date)
    );
  
    const foreignRows = [...params.foreignRows].sort((a, b) =>
      a.trade_date.localeCompare(b.trade_date)
    );
  
    const latestPrice = prices.at(-1);
    const price20Ago = prices.length >= 20 ? prices[prices.length - 20] : prices[0];
    const price10Ago = prices.length >= 10 ? prices[prices.length - 10] : prices[0];
  
    const latestClose = n(latestPrice?.close);
    const priceChange20 =
      latestClose && price20Ago?.close
        ? pctChange(latestClose, n(price20Ago.close))
        : null;
  
    const priceChange10 =
      latestClose && price10Ago?.close
        ? pctChange(latestClose, n(price10Ago.close))
        : null;
  
    const foreign20 = foreignRows.slice(-20);
    const foreign10 = foreignRows.slice(-10);
    const foreign5 = foreignRows.slice(-5);
  
    const foreignBuy20 = foreign20.reduce((sum, r) => sum + getForeignBuy(r), 0);
    const foreignBuy10 = foreign10.reduce((sum, r) => sum + getForeignBuy(r), 0);
    const foreignBuy5 = foreign5.reduce((sum, r) => sum + getForeignBuy(r), 0);
    const foreignDays = foreign20.filter((r) => getForeignBuy(r) > 0).length;
  
    const amountScore = scoreForeignAmount(foreignBuy20);
    const daysScore = scoreForeignDays(foreignDays);
    const mutedPriceScore = scorePriceMuted(priceChange20);
    const consistencyScore = scoreConsistency(foreign20);
    const absorptionScore = scoreAbsorptionEfficiency(foreignBuy20, priceChange20);
  
    const accumulationScore = Math.round(
      clamp(
        amountScore +
          daysScore +
          mutedPriceScore +
          consistencyScore +
          absorptionScore
      )
    );
  
    const absorptionEfficiency =
      priceChange20 === null
        ? 0
        : Math.round((foreignBuy20 / Math.max(Math.abs(priceChange20), 1)) * 100) /
          100;
  
    return {
      foreignBuy20,
      foreignBuy10,
      foreignBuy5,
      foreignDays,
      priceChange20,
      priceChange10,
      absorptionEfficiency,
      consistencyScore,
      accumulationScore,
      stars: starsFromScore(accumulationScore),
      signal: signalFromScore(accumulationScore),
      reason: buildReason({
        foreignBuy20,
        foreignDays,
        priceChange20,
        absorptionEfficiency,
        consistencyScore,
      }),
    };
  }