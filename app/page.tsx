'use client';

import React, { useState } from 'react';

type ForeignRecord = {
  date: string;
  buy: number | null;
  sell: number | null;
  net: number | null;
};

type RangePoint = {
  date: string;
  price: number | null;
};

type SupportResistanceItem = {
  label: string;
  support: RangePoint | null;
  resistance: RangePoint | null;
  supportDistancePercent: number | null;
  resistanceDistancePercent: number | null;
};

type FibonacciLevel = {
  label: string;
  price: number | null;
};

type RangeStats = {
  last30Days?: {
    highest: RangePoint | null;
    lowest: RangePoint | null;
    tradingDays: number;
  };
  last60Days?: {
    highest: RangePoint | null;
    lowest: RangePoint | null;
    tradingDays: number;
  };
  last360Days?: {
    highest: RangePoint | null;
    lowest: RangePoint | null;
    tradingDays: number;
  };
  movingAverages?: {
    ma20: number | null;
    ma60: number | null;
    ma240: number | null;
  };
  volumeCostZone?: {
    price: number | null;
    rangeLow: number | null;
    rangeHigh: number | null;
    totalVolume: number | null;
    note: string;
  };
  fibonacci?: {
    high: number | null;
    low: number | null;
    levels: FibonacciLevel[];
    note?: string;
  };
  supportResistance?: {
    status: string;
    items: SupportResistanceItem[];
    note: string;
  };
  supportStrength?: {
    score: number;
    rating: string;
    reasons: string[];
    note: string;
  };
};

type StockResult = {
  symbol: string;
  name: string;
  market: string;
  date: string;
  open: number | null;
  max: number | null;
  min: number | null;
  close: number | null;
  volume: number | null;
  rangeStats?: RangeStats;
  foreign10Days?: ForeignRecord[];
  foreign10DaysUnit?: string;
  meta?: {
    advancedEnabled: boolean;
    foreignEnabled: boolean;
    lightMode: boolean;
  };
};

export default function Page() {
  const getPreviousBusinessDay = () => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);

    do {
      date.setDate(date.getDate() - 1);
    } while (date.getDay() === 0 || date.getDay() === 6);

    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');

    return `${y}-${m}-${d}`;
  };

  const [symbol, setSymbol] = useState('3491');
  const [queryDate, setQueryDate] = useState(getPreviousBusinessDay);
  const [includeAdvanced, setIncludeAdvanced] = useState(true);
  const [includeForeign, setIncludeForeign] = useState(false);
  const [result, setResult] = useState<StockResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const formatNumber = (value: number | null | undefined) => {
    if (value === null || value === undefined || Number.isNaN(value)) return '-';
    return value.toLocaleString();
  };

  const formatPercent = (value: number | null | undefined) => {
    if (value === null || value === undefined || Number.isNaN(value)) return '-';
    return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  const fetchPrice = async () => {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const url =
        `/api/stock?symbol=${encodeURIComponent(symbol.trim())}` +
        `&date=${encodeURIComponent(queryDate)}` +
        `&advanced=${includeAdvanced ? '1' : '0'}` +
        `&foreign=${includeForeign ? '1' : '0'}`;

      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(`${data.error || '查詢失敗'}${data.detail ? `\n${data.detail}` : ''}`);
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message || '查詢失敗，請檢查股票代號、日期或資料源');
    } finally {
      setLoading(false);
    }
  };

  const StatBox = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="bg-white p-2.5 rounded-xl">
      <div className="text-gray-500 text-[11px]">{label}</div>
      <div className="text-sm font-bold text-gray-800">{value}</div>
    </div>
  );

  return (
    <main className="min-h-screen bg-gray-50 p-3 text-[60%]">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-xl font-bold text-center mb-5 text-gray-800">
          台股歷史價格查詢器
        </h1>

        <div className="bg-white p-5 rounded-2xl shadow-xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium mb-1.5 text-gray-700">股票代號</label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-lg font-medium text-gray-800"
                placeholder="例如：3491"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5 text-gray-700">查詢日期</label>
              <input
                type="date"
                value={queryDate}
                onChange={(e) => setQueryDate(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-800 text-base"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-4 mb-4 text-xs text-gray-700">
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={includeAdvanced}
                onChange={(e) => setIncludeAdvanced(e.target.checked)}
              />
              技術分析
            </label>

            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={includeForeign}
                onChange={(e) => setIncludeForeign(e.target.checked)}
              />
              外資近10日
            </label>

            <span className="text-gray-400">
              關閉外資可大幅降低查詢負荷
            </span>
          </div>

          <button
            onClick={fetchPrice}
            disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white text-base font-medium rounded-xl disabled:opacity-50"
          >
            {loading ? '查詢中...' : '查詢歷史收盤價'}
          </button>

          {error && (
            <pre className="mt-4 p-3 bg-red-100 text-red-700 rounded-xl whitespace-pre-wrap font-sans text-xs">
              {error}
            </pre>
          )}

          {result && (
            <div className="mt-5 p-5 bg-gradient-to-br from-blue-50 to-white border border-blue-100 rounded-2xl text-center">
              <div className="text-5xl font-bold text-blue-600 mb-2">{formatNumber(result.close)}</div>

              <div className="text-lg text-gray-800">{result.symbol} {result.name}</div>
              <div className="text-sm text-gray-500 mt-1">{result.market}・{result.date}</div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5 text-left">
                <StatBox label="開盤價" value={formatNumber(result.open)} />
                <StatBox label="最高價" value={formatNumber(result.max)} />
                <StatBox label="最低價" value={formatNumber(result.min)} />
                <StatBox label="成交股數" value={formatNumber(result.volume)} />
              </div>

              {includeAdvanced && (
                <>
                  <div className="mt-5 text-left">
                    <div className="text-base font-bold text-gray-800 mb-2">均線 / 成本 / 強度</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <StatBox label="20MA" value={formatNumber(result.rangeStats?.movingAverages?.ma20)} />
                      <StatBox label="60MA" value={formatNumber(result.rangeStats?.movingAverages?.ma60)} />
                      <StatBox label="240MA" value={formatNumber(result.rangeStats?.movingAverages?.ma240)} />
                      <StatBox
                        label="支撐強度"
                        value={`${result.rangeStats?.supportStrength?.score ?? 0}分｜${result.rangeStats?.supportStrength?.rating || '-'}`}
                      />
                    </div>
                  </div>

                  <div className="mt-5 text-left">
                    <div className="text-base font-bold text-gray-800 mb-2">成交量成本區</div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <StatBox label="成本均價" value={formatNumber(result.rangeStats?.volumeCostZone?.price)} />
                      <StatBox label="成本區下緣" value={formatNumber(result.rangeStats?.volumeCostZone?.rangeLow)} />
                      <StatBox label="成本區上緣" value={formatNumber(result.rangeStats?.volumeCostZone?.rangeHigh)} />
                    </div>
                  </div>

                  <div className="mt-5 text-left">
                    <div className="text-base font-bold text-gray-800 mb-2">區間高低價</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <StatBox
                        label="30日最高"
                        value={
                          <>
                            {formatNumber(result.rangeStats?.last30Days?.highest?.price)}
                            <span className="block text-[10px] text-gray-500">{result.rangeStats?.last30Days?.highest?.date || '-'}</span>
                          </>
                        }
                      />
                      <StatBox
                        label="30日最低"
                        value={
                          <>
                            {formatNumber(result.rangeStats?.last30Days?.lowest?.price)}
                            <span className="block text-[10px] text-gray-500">{result.rangeStats?.last30Days?.lowest?.date || '-'}</span>
                          </>
                        }
                      />
                      <StatBox
                        label="360日最高"
                        value={
                          <>
                            {formatNumber(result.rangeStats?.last360Days?.highest?.price)}
                            <span className="block text-[10px] text-gray-500">{result.rangeStats?.last360Days?.highest?.date || '-'}</span>
                          </>
                        }
                      />
                      <StatBox
                        label="360日最低"
                        value={
                          <>
                            {formatNumber(result.rangeStats?.last360Days?.lowest?.price)}
                            <span className="block text-[10px] text-gray-500">{result.rangeStats?.last360Days?.lowest?.date || '-'}</span>
                          </>
                        }
                      />
                    </div>
                  </div>

                  <div className="mt-5 text-left">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-base font-bold text-gray-800">支撐 / 壓力估算</div>
                      <div className="text-xs text-blue-600 font-bold">
                        {result.rangeStats?.supportResistance?.status || '-'}
                      </div>
                    </div>

                    <div className="overflow-x-auto bg-white rounded-xl">
                      <table className="w-full text-[11px]">
                        <thead className="bg-gray-100 text-gray-600">
                          <tr>
                            <th className="p-2 text-left">區間</th>
                            <th className="p-2 text-right">支撐價</th>
                            <th className="p-2 text-right">距離</th>
                            <th className="p-2 text-right">壓力價</th>
                            <th className="p-2 text-right">距離</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.rangeStats?.supportResistance?.items?.map((row) => (
                            <tr key={row.label} className="border-t">
                              <td className="p-2 text-gray-700">{row.label}</td>
                              <td className="p-2 text-right text-gray-800">
                                {formatNumber(row.support?.price)}
                                <span className="block text-[10px] text-gray-500">{row.support?.date || '-'}</span>
                              </td>
                              <td className="p-2 text-right font-bold text-green-600">
                                {formatPercent(row.supportDistancePercent)}
                              </td>
                              <td className="p-2 text-right text-gray-800">
                                {formatNumber(row.resistance?.price)}
                                <span className="block text-[10px] text-gray-500">{row.resistance?.date || '-'}</span>
                              </td>
                              <td className="p-2 text-right font-bold text-red-600">
                                {formatPercent(row.resistanceDistancePercent)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="mt-5 text-left">
                    <div className="text-base font-bold text-gray-800 mb-2">Fibonacci 回檔支撐</div>
                    <div className="overflow-x-auto bg-white rounded-xl">
                      <table className="w-full text-[11px]">
                        <thead className="bg-gray-100 text-gray-600">
                          <tr>
                            <th className="p-2 text-left">級距</th>
                            <th className="p-2 text-right">價格</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.rangeStats?.fibonacci?.levels?.length ? (
                            result.rangeStats.fibonacci.levels.map((row) => (
                              <tr key={row.label} className="border-t">
                                <td className="p-2 text-gray-700">{row.label}</td>
                                <td className="p-2 text-right font-bold text-gray-800">{formatNumber(row.price)}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={2} className="p-3 text-center text-gray-500">查無 Fibonacci 資料</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="mt-5 text-left">
                    <div className="text-base font-bold text-gray-800 mb-2">支撐強度原因</div>
                    <div className="bg-white rounded-xl p-3 text-xs text-gray-700">
                      {result.rangeStats?.supportStrength?.reasons?.length ? (
                        <ul className="list-disc pl-4">
                          {result.rangeStats.supportStrength.reasons.map((reason) => (
                            <li key={reason}>{reason}</li>
                          ))}
                        </ul>
                      ) : (
                        <div className="text-gray-500">目前沒有多重支撐重疊訊號</div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {includeForeign && (
                <div className="mt-5 text-left">
                  <div className="text-base font-bold text-gray-800 mb-2">外資近 10 個交易日買賣超</div>

                  <div className="overflow-x-auto bg-white rounded-xl">
                    <table className="w-full text-[11px]">
                      <thead className="bg-gray-100 text-gray-600">
                        <tr>
                          <th className="p-2 text-left">日期</th>
                          <th className="p-2 text-right">買進</th>
                          <th className="p-2 text-right">賣出</th>
                          <th className="p-2 text-right">買賣超</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.foreign10Days && result.foreign10Days.length > 0 ? (
                          result.foreign10Days.map((row) => (
                            <tr key={row.date} className="border-t">
                              <td className="p-2 text-gray-700">{row.date}</td>
                              <td className="p-2 text-right text-gray-800">{formatNumber(row.buy)}</td>
                              <td className="p-2 text-right text-gray-800">{formatNumber(row.sell)}</td>
                              <td className={`p-2 text-right font-bold ${(row.net || 0) >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {formatNumber(row.net)}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={4} className="p-3 text-center text-gray-500">查無外資近 10 日資料</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="text-[10px] text-gray-500 mt-1">單位：{result.foreign10DaysUnit || '張'}</div>
                </div>
              )}
            </div>
          )}
        </div>

        <p className="text-center text-[11px] text-gray-500 mt-5">
          支援台股歷史價格查詢，上市使用 TWSE，上櫃使用 TPEx。
          <br />
          技術指標為程式估算，不構成投資建議。
        </p>
      </div>
    </main>
  );
}
