export type DataQualityLevel = "green" | "yellow" | "red";
export type PublishMode = "full" | "degraded" | "blocked";

export type DataSourceQuality = {
  key: "price" | "institutional" | "margin" | "fundamental" | "market";
  ok: boolean;
  rows: number;
  minRows: number;
  status: string;
  message: string | null;
};

export type M8121DataQuality = {
  version: "M8.12.3";
  tradeDate: string;
  score: number;
  level: DataQualityLevel;
  publishMode: PublishMode;
  reportExists: boolean;
  sources: DataSourceQuality[];
  warnings: string[];
  sourceDates: {
    bulk: string | null;
    risk: string | null;
    fundamental: string | null;
    market: string | null;
    report: string | null;
  };
};

export type BruceSwingInput = {
  symbol: string;
  stockName?: string | null;
  foreignPersistence?: number | null;
  stealth?: number | null;
  marginWashout?: number | null;
  trigger?: number | null;
  breakout?: number | null;
  price20Pct?: number | null;
  fundamentalScore?: number | null;
  marketRisk?: number | null;
  daytradeRatio?: number | null;
  sourceConfidence?: number | null;
};

export type BruceSwingResult = {
  symbol: string;
  stockName?: string | null;
  score: number;
  grade: "A1" | "A0" | "B+" | "B" | "C";
  action: "偏多" | "觀察" | "等待" | "避開";
  confidence: number;
  breakdown: {
    chip: number;
    momentum: number;
    relativeStrength: number;
    foreignStealth: number;
    fundamental: number;
    market: number;
    washout: number;
  };
  reasons: string[];
  warnings: string[];
};
