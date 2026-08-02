export interface DailyPriceRecord {
  readonly symbol: string;
  readonly tradeDate: string;
  readonly open: number | null;
  readonly high: number | null;
  readonly low: number | null;
  readonly close: number;
  readonly volume: number | null;
  readonly updatedAt: string;
}

export interface DailyPriceRange {
  readonly from: string;
  readonly to: string;
}

export interface PriceRepository {
  findLatest(symbol: string): Promise<DailyPriceRecord | null>;
  findRange(symbol: string, range: DailyPriceRange): Promise<readonly DailyPriceRecord[]>;
  upsertMany(prices: readonly DailyPriceRecord[]): Promise<void>;
  deleteBefore(date: string): Promise<number>;
}
