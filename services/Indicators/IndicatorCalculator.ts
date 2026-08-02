/**
 * TSDE Technical Indicator Calculator
 *
 * 支援指標：
 * - MA5 / MA10 / MA20 / MA60 / MA120 / MA240
 * - Volume MA5 / Volume MA20
 * - RSI14
 * - KD（9, 3, 3）
 * - MACD（12, 26, 9）
 * - Bollinger Bands（20, 2）
 * - ATR14
 *
 * 資料順序：
 * - 輸入可以是任意日期順序
 * - 計算前會依 trade_date 由舊到新排序
 *
 * 空值原則：
 * - 資料不足時回傳 null
 * - 不以 0 取代尚未形成的技術指標
 */

export type NullableNumber = number | null;

/**
 * 從 stock_prices 讀取的股價資料。
 *
 * Supabase numeric 欄位有時可能被回傳為字串，
 * 因此數值欄位允許 number、string 或 null。
 */
export type IndicatorPriceRow = {
  symbol: string;
  trade_date: string;

  open?: number | string | null;
  high?: number | string | null;
  low?: number | string | null;
  close?: number | string | null;
  volume?: number | string | null;
  turnover?: number | string | null;

  source?: string | null;
};

/**
 * 寫入 stock_indicators 的技術指標資料。
 */
export type IndicatorResultRow = {
  symbol: string;
  trade_date: string;

  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;

  ma5: number | null;
  ma10: number | null;
  ma20: number | null;
  ma60: number | null;
  ma120: number | null;
  ma240: number | null;

  volume_ma5: number | null;
  volume_ma20: number | null;

  rsi14: number | null;

  k: number | null;
  d: number | null;

  macd: number | null;
  macd_signal: number | null;
  macd_histogram: number | null;

  bollinger_upper: number | null;
  bollinger_middle: number | null;
  bollinger_lower: number | null;

  atr14: number | null;

  calculated_at: string;
};

/**
 * 舊版 Repository 使用的型別名稱。
 *
 * 請保留這一行，避免 IndicatorRepository.ts Build 失敗。
 */
export type IndicatorRow = IndicatorResultRow;

/**
 * 提供給前端或其他 Service 使用的 camelCase 格式。
 */
export type IndicatorResultCamelCase = {
  symbol: string;
  tradeDate: string;

  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;

  ma5: number | null;
  ma10: number | null;
  ma20: number | null;
  ma60: number | null;
  ma120: number | null;
  ma240: number | null;

  volumeMa5: number | null;
  volumeMa20: number | null;

  rsi14: number | null;

  k: number | null;
  d: number | null;

  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;

  bollingerUpper: number | null;
  bollingerMiddle: number | null;
  bollingerLower: number | null;

  atr14: number | null;

  calculatedAt: string;
};

const RSI_PERIOD = 14;

const KD_PERIOD = 9;
const KD_SMOOTHING = 3;

const MACD_FAST_PERIOD = 12;
const MACD_SLOW_PERIOD = 26;
const MACD_SIGNAL_PERIOD = 9;

const BOLLINGER_PERIOD = 20;
const BOLLINGER_MULTIPLIER = 2;

const ATR_PERIOD = 14;

/**
 * 將 Supabase 回傳值安全轉成有限數字。
 */
function toFiniteNumber(value: unknown): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

/**
 * 統一技術指標的小數位數。
 */
function roundValue(
  value: number | null,
  digits = 6,
): number | null {
  if (
    value === null ||
    !Number.isFinite(value)
  ) {
    return null;
  }

  const factor = 10 ** digits;

  return (
    Math.round(
      (value + Number.EPSILON) * factor,
    ) / factor
  );
}

/**
 * Type Guard：確認陣列所有元素均為有效 number。
 */
function isNumberArray(
  values: Array<number | null>,
): values is number[] {
  return values.every(
    (value): value is number =>
      typeof value === "number" &&
      Number.isFinite(value),
  );
}

/**
 * 取得指定位置前 period 筆完整資料。
 */
function getWindowValues(
  values: Array<number | null>,
  index: number,
  period: number,
): number[] | null {
  if (
    period <= 0 ||
    index < period - 1
  ) {
    return null;
  }

  const startIndex =
    index + 1 - period;

  const windowValues =
    values.slice(
      startIndex,
      index + 1,
    );

  if (
    windowValues.length !== period ||
    !isNumberArray(windowValues)
  ) {
    return null;
  }

  return windowValues;
}

/**
 * 計算指定位置的簡單移動平均。
 */
function simpleMovingAverageAt(
  values: Array<number | null>,
  index: number,
  period: number,
): number | null {
  const windowValues =
    getWindowValues(
      values,
      index,
      period,
    );

  if (windowValues === null) {
    return null;
  }

  const total: number =
    windowValues.reduce(
      (
        sum: number,
        value: number,
      ): number => sum + value,
      0,
    );

  return roundValue(
    total / period,
  );
}

/**
 * 計算完整 SMA 序列。
 */
function calculateSmaSeries(
  values: Array<number | null>,
  period: number,
): Array<number | null> {
  const result: Array<number | null> =
    new Array(values.length).fill(null);

  for (
    let index = 0;
    index < values.length;
    index += 1
  ) {
    result[index] =
      simpleMovingAverageAt(
        values,
        index,
        period,
      );
  }

  return result;
}

/**
 * 計算 EMA。
 *
 * 第一個有效 EMA 使用該 period 的 SMA；
 * 後續使用標準 EMA 平滑公式。
 */
function calculateEmaSeries(
  values: Array<number | null>,
  period: number,
): Array<number | null> {
  const result: Array<number | null> =
    new Array(values.length).fill(null);

  if (
    period <= 0 ||
    values.length < period
  ) {
    return result;
  }

  const multiplier: number =
    2 / (period + 1);

  let previousEma: number | null =
    null;

  for (
    let index = 0;
    index < values.length;
    index += 1
  ) {
    const currentValue:
      number | null =
      values[index] ?? null;

    if (currentValue === null) {
      previousEma = null;
      result[index] = null;
      continue;
    }

    if (previousEma === null) {
      const initialValues =
        getWindowValues(
          values,
          index,
          period,
        );

      if (initialValues === null) {
        result[index] = null;
        continue;
      }

      const initialTotal: number =
        initialValues.reduce(
          (
            sum: number,
            value: number,
          ): number => sum + value,
          0,
        );

      const initialSma: number =
        initialTotal / period;

      previousEma = initialSma;

      result[index] =
        roundValue(initialSma);

      continue;
    }

    /**
     * 明確指定 number，修正：
     * "'ema' implicitly has type 'any'"
     */
    const currentEma: number =
      currentValue * multiplier +
      previousEma *
        (1 - multiplier);

    previousEma = currentEma;

    result[index] =
      roundValue(currentEma);
  }

  return result;
}

/**
 * 計算母體標準差。
 */
function standardDeviation(
  values: number[],
): number | null {
  if (values.length === 0) {
    return null;
  }

  const total: number =
    values.reduce(
      (
        sum: number,
        value: number,
      ): number => sum + value,
      0,
    );

  const mean: number =
    total / values.length;

  const varianceTotal: number =
    values.reduce(
      (
        sum: number,
        value: number,
      ): number => {
        const difference: number =
          value - mean;

        return (
          sum +
          difference * difference
        );
      },
      0,
    );

  const variance: number =
    varianceTotal / values.length;

  return roundValue(
    Math.sqrt(variance),
  );
}

/**
 * 計算 RSI，採 Wilder 平滑法。
 */
function calculateRsiSeries(
  closes: Array<number | null>,
  period = RSI_PERIOD,
): Array<number | null> {
  const result: Array<number | null> =
    new Array(closes.length).fill(null);

  if (
    period <= 0 ||
    closes.length <= period
  ) {
    return result;
  }

  const gains: Array<number | null> =
    new Array(closes.length).fill(null);

  const losses: Array<number | null> =
    new Array(closes.length).fill(null);

  for (
    let index = 1;
    index < closes.length;
    index += 1
  ) {
    const current:
      number | null =
      closes[index] ?? null;

    const previous:
      number | null =
      closes[index - 1] ?? null;

    if (
      current === null ||
      previous === null
    ) {
      gains[index] = null;
      losses[index] = null;
      continue;
    }

    const change: number =
      current - previous;

    gains[index] =
      Math.max(change, 0);

    losses[index] =
      Math.max(-change, 0);
  }

  let averageGain: number | null =
    null;

  let averageLoss: number | null =
    null;

  for (
    let index = period;
    index < closes.length;
    index += 1
  ) {
    if (
      averageGain === null ||
      averageLoss === null
    ) {
      const gainWindow =
        gains.slice(
          index + 1 - period,
          index + 1,
        );

      const lossWindow =
        losses.slice(
          index + 1 - period,
          index + 1,
        );

      if (
        gainWindow.length !== period ||
        lossWindow.length !== period ||
        !isNumberArray(gainWindow) ||
        !isNumberArray(lossWindow)
      ) {
        result[index] = null;
        continue;
      }

      const totalGain: number =
        gainWindow.reduce(
          (
            sum: number,
            value: number,
          ): number => sum + value,
          0,
        );

      const totalLoss: number =
        lossWindow.reduce(
          (
            sum: number,
            value: number,
          ): number => sum + value,
          0,
        );

      averageGain =
        totalGain / period;

      averageLoss =
        totalLoss / period;
    } else {
      const currentGain:
        number | null =
        gains[index] ?? null;

      const currentLoss:
        number | null =
        losses[index] ?? null;

      if (
        currentGain === null ||
        currentLoss === null
      ) {
        averageGain = null;
        averageLoss = null;
        result[index] = null;
        continue;
      }

      const nextAverageGain:
        number =
        (
          averageGain *
            (period - 1) +
          currentGain
        ) / period;

      const nextAverageLoss:
        number =
        (
          averageLoss *
            (period - 1) +
          currentLoss
        ) / period;

      averageGain =
        nextAverageGain;

      averageLoss =
        nextAverageLoss;
    }

    if (averageLoss === 0) {
      result[index] =
        averageGain === 0
          ? 50
          : 100;

      continue;
    }

    const relativeStrength: number =
      averageGain / averageLoss;

    const rsi: number =
      100 -
      100 /
        (1 + relativeStrength);

    result[index] =
      roundValue(rsi);
  }

  return result;
}

/**
 * 計算 KD（9,3,3）。
 *
 * RSV =
 * (收盤價 - 期間最低價) /
 * (期間最高價 - 期間最低價) × 100
 */
function calculateKdSeries(
  highs: Array<number | null>,
  lows: Array<number | null>,
  closes: Array<number | null>,
  period = KD_PERIOD,
  smoothing = KD_SMOOTHING,
): {
  kValues: Array<number | null>;
  dValues: Array<number | null>;
} {
  const kValues:
    Array<number | null> =
    new Array(closes.length).fill(null);

  const dValues:
    Array<number | null> =
    new Array(closes.length).fill(null);

  let previousK: number = 50;
  let previousD: number = 50;

  for (
    let index = 0;
    index < closes.length;
    index += 1
  ) {
    const highWindow =
      getWindowValues(
        highs,
        index,
        period,
      );

    const lowWindow =
      getWindowValues(
        lows,
        index,
        period,
      );

    const close:
      number | null =
      closes[index] ?? null;

    if (
      highWindow === null ||
      lowWindow === null ||
      close === null
    ) {
      kValues[index] = null;
      dValues[index] = null;
      continue;
    }

    const highestHigh: number =
      Math.max(...highWindow);

    const lowestLow: number =
      Math.min(...lowWindow);

    const priceRange: number =
      highestHigh - lowestLow;

    const rsv: number =
      priceRange === 0
        ? 50
        : (
            (close - lowestLow) /
            priceRange
          ) * 100;

    const currentK: number =
      (
        previousK *
          (smoothing - 1) +
        rsv
      ) / smoothing;

    const currentD: number =
      (
        previousD *
          (smoothing - 1) +
        currentK
      ) / smoothing;

    previousK = currentK;
    previousD = currentD;

    kValues[index] =
      roundValue(currentK);

    dValues[index] =
      roundValue(currentD);
  }

  return {
    kValues,
    dValues,
  };
}

/**
 * 計算 MACD（12,26,9）。
 */
function calculateMacdSeries(
  closes: Array<number | null>,
): {
  macdValues: Array<number | null>;
  signalValues: Array<number | null>;
  histogramValues: Array<number | null>;
} {
  const fastEma =
    calculateEmaSeries(
      closes,
      MACD_FAST_PERIOD,
    );

  const slowEma =
    calculateEmaSeries(
      closes,
      MACD_SLOW_PERIOD,
    );

  const macdValues:
    Array<number | null> =
    new Array(closes.length).fill(null);

  for (
    let index = 0;
    index < closes.length;
    index += 1
  ) {
    const fast:
      number | null =
      fastEma[index] ?? null;

    const slow:
      number | null =
      slowEma[index] ?? null;

    if (
      fast === null ||
      slow === null
    ) {
      macdValues[index] = null;
      continue;
    }

    const macdValue: number =
      fast - slow;

    macdValues[index] =
      roundValue(macdValue);
  }

  const signalValues =
    calculateEmaSeries(
      macdValues,
      MACD_SIGNAL_PERIOD,
    );

  const histogramValues:
    Array<number | null> =
    new Array(closes.length).fill(null);

  for (
    let index = 0;
    index < closes.length;
    index += 1
  ) {
    const macd:
      number | null =
      macdValues[index] ?? null;

    const signal:
      number | null =
      signalValues[index] ?? null;

    if (
      macd === null ||
      signal === null
    ) {
      histogramValues[index] = null;
      continue;
    }

    const histogram: number =
      macd - signal;

    histogramValues[index] =
      roundValue(histogram);
  }

  return {
    macdValues,
    signalValues,
    histogramValues,
  };
}

/**
 * 計算 Bollinger Bands（20,2）。
 */
function calculateBollingerSeries(
  closes: Array<number | null>,
): {
  upperValues: Array<number | null>;
  middleValues: Array<number | null>;
  lowerValues: Array<number | null>;
} {
  const middleValues =
    calculateSmaSeries(
      closes,
      BOLLINGER_PERIOD,
    );

  const upperValues:
    Array<number | null> =
    new Array(closes.length).fill(null);

  const lowerValues:
    Array<number | null> =
    new Array(closes.length).fill(null);

  for (
    let index = 0;
    index < closes.length;
    index += 1
  ) {
    const windowValues =
      getWindowValues(
        closes,
        index,
        BOLLINGER_PERIOD,
      );

    const middle:
      number | null =
      middleValues[index] ?? null;

    if (
      windowValues === null ||
      middle === null
    ) {
      continue;
    }

    const deviation =
      standardDeviation(
        windowValues,
      );

    if (deviation === null) {
      continue;
    }

    const upper: number =
      middle +
      BOLLINGER_MULTIPLIER *
        deviation;

    const lower: number =
      middle -
      BOLLINGER_MULTIPLIER *
        deviation;

    upperValues[index] =
      roundValue(upper);

    lowerValues[index] =
      roundValue(lower);
  }

  return {
    upperValues,
    middleValues,
    lowerValues,
  };
}

/**
 * 計算 True Range。
 */
function calculateTrueRange(
  high: number,
  low: number,
  previousClose: number | null,
): number {
  const highLow: number =
    Math.abs(high - low);

  if (previousClose === null) {
    return highLow;
  }

  const highPreviousClose: number =
    Math.abs(
      high - previousClose,
    );

  const lowPreviousClose: number =
    Math.abs(
      low - previousClose,
    );

  return Math.max(
    highLow,
    highPreviousClose,
    lowPreviousClose,
  );
}

/**
 * 計算 ATR14，採 Wilder 平滑法。
 */
function calculateAtrSeries(
  highs: Array<number | null>,
  lows: Array<number | null>,
  closes: Array<number | null>,
  period = ATR_PERIOD,
): Array<number | null> {
  const trueRanges:
    Array<number | null> =
    new Array(closes.length).fill(null);

  const atrValues:
    Array<number | null> =
    new Array(closes.length).fill(null);

  for (
    let index = 0;
    index < closes.length;
    index += 1
  ) {
    const high:
      number | null =
      highs[index] ?? null;

    const low:
      number | null =
      lows[index] ?? null;

    if (
      high === null ||
      low === null
    ) {
      trueRanges[index] = null;
      continue;
    }

    const previousClose:
      number | null =
      index > 0
        ? closes[index - 1] ?? null
        : null;

    const trueRange: number =
      calculateTrueRange(
        high,
        low,
        previousClose,
      );

    trueRanges[index] =
      roundValue(trueRange);
  }

  let previousAtr: number | null =
    null;

  for (
    let index = 0;
    index < trueRanges.length;
    index += 1
  ) {
    if (previousAtr === null) {
      const initialWindow =
        getWindowValues(
          trueRanges,
          index,
          period,
        );

      if (initialWindow === null) {
        continue;
      }

      const initialTotal: number =
        initialWindow.reduce(
          (
            sum: number,
            value: number,
          ): number => sum + value,
          0,
        );

      const initialAtr: number =
        initialTotal / period;

      previousAtr = initialAtr;

      atrValues[index] =
        roundValue(initialAtr);

      continue;
    }

    const currentTrueRange:
      number | null =
      trueRanges[index] ?? null;

    if (currentTrueRange === null) {
      previousAtr = null;
      atrValues[index] = null;
      continue;
    }

    const currentAtr: number =
      (
        previousAtr *
          (period - 1) +
        currentTrueRange
      ) / period;

    previousAtr = currentAtr;

    atrValues[index] =
      roundValue(currentAtr);
  }

  return atrValues;
}

/**
 * 依交易日期由舊至新排序。
 */
function sortPricesAscending(
  prices: IndicatorPriceRow[],
): IndicatorPriceRow[] {
  return [...prices].sort(
    (
      left: IndicatorPriceRow,
      right: IndicatorPriceRow,
    ): number =>
      left.trade_date.localeCompare(
        right.trade_date,
      ),
  );
}

/**
 * 計算全部交易日技術指標。
 */
export function calculateIndicators(
  prices: IndicatorPriceRow[],
): IndicatorResultRow[] {
  if (prices.length === 0) {
    return [];
  }

  const sortedPrices:
    IndicatorPriceRow[] =
    sortPricesAscending(prices);

  const closes:
    Array<number | null> =
    sortedPrices.map(
      (
        row: IndicatorPriceRow,
      ): number | null =>
        toFiniteNumber(row.close),
    );

  const highs:
    Array<number | null> =
    sortedPrices.map(
      (
        row: IndicatorPriceRow,
      ): number | null =>
        toFiniteNumber(row.high),
    );

  const lows:
    Array<number | null> =
    sortedPrices.map(
      (
        row: IndicatorPriceRow,
      ): number | null =>
        toFiniteNumber(row.low),
    );

  const volumes:
    Array<number | null> =
    sortedPrices.map(
      (
        row: IndicatorPriceRow,
      ): number | null =>
        toFiniteNumber(row.volume),
    );

  const ma5 =
    calculateSmaSeries(closes, 5);

  const ma10 =
    calculateSmaSeries(closes, 10);

  const ma20 =
    calculateSmaSeries(closes, 20);

  const ma60 =
    calculateSmaSeries(closes, 60);

  const ma120 =
    calculateSmaSeries(closes, 120);

  const ma240 =
    calculateSmaSeries(closes, 240);

  const volumeMa5 =
    calculateSmaSeries(volumes, 5);

  const volumeMa20 =
    calculateSmaSeries(volumes, 20);

  const rsi14 =
    calculateRsiSeries(
      closes,
      RSI_PERIOD,
    );

  const {
    kValues,
    dValues,
  } = calculateKdSeries(
    highs,
    lows,
    closes,
  );

  const {
    macdValues,
    signalValues,
    histogramValues,
  } = calculateMacdSeries(
    closes,
  );

  const {
    upperValues,
    middleValues,
    lowerValues,
  } = calculateBollingerSeries(
    closes,
  );

  const atr14 =
    calculateAtrSeries(
      highs,
      lows,
      closes,
      ATR_PERIOD,
    );

  const calculatedAt: string =
    new Date().toISOString();

  return sortedPrices.map(
    (
      row: IndicatorPriceRow,
      index: number,
    ): IndicatorResultRow => ({
      symbol: row.symbol.trim(),
      trade_date: row.trade_date,

      open:
        toFiniteNumber(row.open),

      high:
        highs[index] ?? null,

      low:
        lows[index] ?? null,

      close:
        closes[index] ?? null,

      volume:
        volumes[index] ?? null,

      ma5:
        ma5[index] ?? null,

      ma10:
        ma10[index] ?? null,

      ma20:
        ma20[index] ?? null,

      ma60:
        ma60[index] ?? null,

      ma120:
        ma120[index] ?? null,

      ma240:
        ma240[index] ?? null,

      volume_ma5:
        volumeMa5[index] ?? null,

      volume_ma20:
        volumeMa20[index] ?? null,

      rsi14:
        rsi14[index] ?? null,

      k:
        kValues[index] ?? null,

      d:
        dValues[index] ?? null,

      macd:
        macdValues[index] ?? null,

      macd_signal:
        signalValues[index] ?? null,

      macd_histogram:
        histogramValues[index] ??
        null,

      bollinger_upper:
        upperValues[index] ?? null,

      bollinger_middle:
        middleValues[index] ?? null,

      bollinger_lower:
        lowerValues[index] ?? null,

      atr14:
        atr14[index] ?? null,

      calculated_at:
        calculatedAt,
    }),
  );
}

/**
 * 相容舊版函式名稱。
 */
export const calculateStockIndicators:
  typeof calculateIndicators =
  calculateIndicators;

/**
 * 只取得最新一筆指標。
 */
export function calculateLatestIndicator(
  prices: IndicatorPriceRow[],
): IndicatorResultRow | null {
  const rows:
    IndicatorResultRow[] =
    calculateIndicators(prices);

  if (rows.length === 0) {
    return null;
  }

  return (
    rows[rows.length - 1] ?? null
  );
}

/**
 * snake_case 轉 camelCase。
 */
export function toCamelCaseIndicator(
  row: IndicatorResultRow,
): IndicatorResultCamelCase {
  return {
    symbol: row.symbol,
    tradeDate: row.trade_date,

    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume,

    ma5: row.ma5,
    ma10: row.ma10,
    ma20: row.ma20,
    ma60: row.ma60,
    ma120: row.ma120,
    ma240: row.ma240,

    volumeMa5: row.volume_ma5,
    volumeMa20:
      row.volume_ma20,

    rsi14: row.rsi14,

    k: row.k,
    d: row.d,

    macd: row.macd,
    macdSignal:
      row.macd_signal,

    macdHistogram:
      row.macd_histogram,

    bollingerUpper:
      row.bollinger_upper,

    bollingerMiddle:
      row.bollinger_middle,

    bollingerLower:
      row.bollinger_lower,

    atr14: row.atr14,

    calculatedAt:
      row.calculated_at,
  };
}

export default calculateIndicators;