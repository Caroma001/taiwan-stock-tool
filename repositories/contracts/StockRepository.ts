export type StockMarket = "TWSE" | "TPEx" | "ESB" | "UNKNOWN";

export interface StockRecord {
  readonly symbol: string;
  readonly name: string;
  readonly market: StockMarket;
  readonly industry: string | null;
  readonly isActive: boolean;
  readonly updatedAt: string;
}

export interface StockUpsertInput {
  readonly symbol: string;
  readonly name: string;
  readonly market: StockMarket;
  readonly industry?: string | null;
  readonly isActive?: boolean;
  readonly updatedAt?: string;
}

export interface StockSearchOptions {
  readonly activeOnly?: boolean;
  readonly market?: StockMarket;
  readonly limit?: number;
  readonly offset?: number;
}

export interface StockRepository {
  findBySymbol(symbol: string): Promise<StockRecord | null>;
  list(options?: StockSearchOptions): Promise<readonly StockRecord[]>;
  count(options?: Pick<StockSearchOptions, "activeOnly" | "market">): Promise<number>;
  upsert(stock: StockUpsertInput): Promise<void>;
  upsertMany(stocks: readonly StockUpsertInput[]): Promise<void>;
}
