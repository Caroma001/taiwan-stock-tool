export interface DecisionRecord {
  readonly symbol: string;
  readonly tradeDate: string;
  readonly totalScore: number;
  readonly trendScore: number;
  readonly momentumScore: number;
  readonly riskScore: number;
  readonly confidence: number;
  readonly reasons: readonly string[];
  readonly updatedAt: string;
}

export interface DecisionRepository {
  findLatest(symbol: string): Promise<DecisionRecord | null>;
  upsertLatest(decision: DecisionRecord): Promise<void>;
  rankTop(limit: number): Promise<readonly DecisionRecord[]>;
}
