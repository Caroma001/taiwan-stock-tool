export const DEFAULT_BROKER_FEE_RATE = 0.001425;
export const DEFAULT_MIN_BROKER_FEE = 20;
export const DEFAULT_STOCK_TRANSACTION_TAX_RATE = 0.003;

export type TradeCostInput = {
  price: number;
  shares: number;
  feeRate?: number;
  minimumFee?: number;
  taxRate?: number;
};

function positive(value: number, fallback: number) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function calculateTradeCosts(input: TradeCostInput) {
  const price = positive(Number(input.price), 0);
  const shares = positive(Number(input.shares), 0);
  const grossAmount = Math.round(price * shares);
  const feeRate = positive(Number(input.feeRate), DEFAULT_BROKER_FEE_RATE);
  const minimumFee = positive(Number(input.minimumFee), DEFAULT_MIN_BROKER_FEE);
  const taxRate = positive(Number(input.taxRate), DEFAULT_STOCK_TRANSACTION_TAX_RATE);
  const brokerFee = grossAmount > 0 ? Math.max(minimumFee, Math.round(grossAmount * feeRate)) : 0;
  const transactionTax = grossAmount > 0 ? Math.round(grossAmount * taxRate) : 0;
  return { grossAmount, brokerFee, transactionTax, netProceeds: grossAmount - brokerFee - transactionTax };
}

export function calculateBuyFee(grossAmount: number) {
  const feeRate = positive(Number(process.env.TWSTOCK_BROKER_FEE_RATE), DEFAULT_BROKER_FEE_RATE);
  const minimumFee = positive(Number(process.env.TWSTOCK_BROKER_MIN_FEE), DEFAULT_MIN_BROKER_FEE);
  return grossAmount > 0 ? Math.max(minimumFee, Math.round(grossAmount * feeRate)) : 0;
}

export function calculateSellCosts(price: number, shares: number) {
  return calculateTradeCosts({
    price,
    shares,
    feeRate: positive(Number(process.env.TWSTOCK_BROKER_FEE_RATE), DEFAULT_BROKER_FEE_RATE),
    minimumFee: positive(Number(process.env.TWSTOCK_BROKER_MIN_FEE), DEFAULT_MIN_BROKER_FEE),
    taxRate: positive(Number(process.env.TWSTOCK_STOCK_TRANSACTION_TAX_RATE), DEFAULT_STOCK_TRANSACTION_TAX_RATE),
  });
}
