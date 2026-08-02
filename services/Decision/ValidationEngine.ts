import { round } from "./utils";

export type ValidationInput = {
  entryPrice: number;
  targetPrice1: number;
  targetPrice2: number;
  stopLossPrice: number;
  prices: Array<{ trade_date: string; close: number; high: number; low: number }>;
};

export function validateDecision(input: ValidationInput) {
  let maxGain = 0;
  let maxDrawdown = 0;
  let target1Hit = false;
  let target2Hit = false;
  let stopHit = false;
  let exitPrice = input.prices.at(-1)?.close ?? input.entryPrice;
  let exitDate = input.prices.at(-1)?.trade_date ?? null;
  let outcome = "tracking";

  for (const price of input.prices) {
    maxGain = Math.max(maxGain, ((price.high - input.entryPrice) / input.entryPrice) * 100);
    maxDrawdown = Math.min(maxDrawdown, ((price.low - input.entryPrice) / input.entryPrice) * 100);
    if (price.low <= input.stopLossPrice) { stopHit = true; exitPrice = input.stopLossPrice; exitDate = price.trade_date; outcome = "stop_loss"; break; }
    if (price.high >= input.targetPrice2) { target1Hit = true; target2Hit = true; exitPrice = input.targetPrice2; exitDate = price.trade_date; outcome = "target_2"; break; }
    if (price.high >= input.targetPrice1) { target1Hit = true; exitPrice = input.targetPrice1; exitDate = price.trade_date; outcome = "target_1"; }
  }

  return {
    trading_days: input.prices.length,
    current_price: round(input.prices.at(-1)?.close ?? input.entryPrice),
    current_return_pct: round((((input.prices.at(-1)?.close ?? input.entryPrice) - input.entryPrice) / input.entryPrice) * 100),
    max_gain_pct: round(maxGain),
    max_drawdown_pct: round(maxDrawdown),
    target_1_hit: target1Hit,
    target_2_hit: target2Hit,
    stop_loss_hit: stopHit,
    outcome,
    exit_price: round(exitPrice),
    exit_date: exitDate,
  };
}
