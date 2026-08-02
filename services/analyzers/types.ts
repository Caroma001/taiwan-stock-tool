export type PriceRow = {
    symbol: string;
    trade_date: string;
    open?: number | null;
    high?: number | null;
    low?: number | null;
    close?: number | null;
    volume?: number | null;
    turnover?: number | null;
    source?: string | null;
  };
  
  export type MAResult = {
    ma5: number | null;
    ma10: number | null;
    ma20: number | null;
    ma60: number | null;
    ma120: number | null;
    ma240: number | null;
  };
  
  export type RangeResult = {
    high_60d: number | null;
    low_60d: number | null;
    high_240d: number | null;
    low_240d: number | null;
  };
  
  export type TrendResult = {
    trend_score: number;
  };
  
  export type VolumeResult = {
    volume_score: number;
    volume5: number | null;
    volume20: number | null;
  };