export interface IndicatorSnapshot {
  readonly symbol: string;
  readonly tradeDate: string;
  readonly ma5: number | null;
  readonly ma20: number | null;
  readonly ma60: number | null;
  readonly rsi14: number | null;
  readonly macd: number | null;
  readonly updatedAt: string;
}

export interface IndicatorRepository {
  findLatest(symbol: string): Promise<IndicatorSnapshot | null>;
  upsertLatest(snapshot: IndicatorSnapshot): Promise<void>;
  upsertLatestMany(snapshots: readonly IndicatorSnapshot[]): Promise<void>;
}
