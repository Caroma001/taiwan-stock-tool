"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase";

type DailyPrice = {
  symbol: string;
  trade_date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
};

type ForeignRow = {
  symbol: string;
  trade_date: string;
  foreign_buy: number | null;
};

type MergedRow = DailyPrice & {
  foreign_buy: number | null;
};

function calcMA(data: DailyPrice[], days: number) {
  const rows = data.filter((x) => x.close !== null).slice(0, days);
  if (rows.length < days) return null;
  return rows.reduce((sum, x) => sum + Number(x.close), 0) / days;
}

function getSignal(latest: number | null, ma20: number | null, ma60: number | null) {
  if (!latest || !ma20 || !ma60) return "資料不足";
  if (latest < ma20 && ma20 < ma60) return "賣出";
  if (latest > ma20 && ma20 > ma60) return "買入";
  return "持有";
}

export default function AnalysisPage() {
  const [symbol, setSymbol] = useState("");
  const [rows, setRows] = useState<DailyPrice[]>([]);
  const [foreignRows, setForeignRows] = useState<ForeignRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("symbol") || "";
    setSymbol(s);

    async function load() {
      setLoading(true);

      const [{ data: priceData, error: priceError }, { data: foreignData, error: foreignError }] =
        await Promise.all([
          supabase
            .from("daily_prices")
            .select("*")
            .eq("symbol", s)
            .order("trade_date", { ascending: false })
            .limit(60),

          supabase
            .from("foreign_trading")
            .select("symbol,trade_date,foreign_buy")
            .eq("symbol", s)
            .order("trade_date", { ascending: false })
            .limit(60),
        ]);

      if (priceError) {
        alert("讀取股價資料失敗：" + priceError.message);
      } else {
        setRows((priceData || []) as DailyPrice[]);
      }

      if (foreignError) {
        console.warn("讀取外資資料失敗：", foreignError.message);
        setForeignRows([]);
      } else {
        setForeignRows((foreignData || []) as ForeignRow[]);
      }

      setLoading(false);
    }

    if (s) load();
    else setLoading(false);
  }, []);

  const mergedRows: MergedRow[] = useMemo(() => {
    const foreignMap = new Map(
      foreignRows.map((x) => [x.trade_date, Number(x.foreign_buy ?? 0)])
    );

    return rows.slice(0, 20).map((r) => ({
      ...r,
      foreign_buy: foreignMap.get(r.trade_date) ?? null,
    }));
  }, [rows, foreignRows]);

  const analysis = useMemo(() => {
    const latest = rows[0]?.close ? Number(rows[0].close) : null;
    const ma5 = calcMA(rows, 5);
    const ma20 = calcMA(rows, 20);
    const ma60 = calcMA(rows, 60);

    const high20 = rows.slice(0, 20).reduce((m, x) => Math.max(m, Number(x.high || 0)), 0);

    const low20 = rows.slice(0, 20).reduce((m, x) => {
      const v = Number(x.low || 0);
      return v > 0 ? Math.min(m, v) : m;
    }, Number.MAX_SAFE_INTEGER);

    const foreignBuy20 = mergedRows.reduce(
      (sum, x) => sum + Number(x.foreign_buy ?? 0),
      0
    );

    const signal = getSignal(latest, ma20, ma60);

    return {
      latest,
      ma5,
      ma20,
      ma60,
      high20,
      low20: low20 === Number.MAX_SAFE_INTEGER ? null : low20,
      foreignBuy20,
      signal,
    };
  }, [rows, mergedRows]);

  return (
    <main style={pageStyle}>
      <Link href="/portfolio" style={backButtonStyle}>
        ← 回持股管理
      </Link>

      <h1 style={titleStyle}>📊 個股20日資料：{symbol}</h1>
      <p style={subStyle}>收盤價、成交量、外資買賣超整理</p>

      {loading ? (
        <p>讀取中...</p>
      ) : !symbol ? (
        <section style={cardStyle}>
          <h2>尚未指定股票</h2>
          <p>請從 Portfolio 點選股票代號進入。</p>
        </section>
      ) : rows.length === 0 ? (
        <section style={cardStyle}>
          <h2>資料不足</h2>
          <p>目前沒有 {symbol} 的股價資料，請先回 Dashboard 更新 Watchlist 股價。</p>
        </section>
      ) : (
        <>
          <section style={gridStyle}>
            <Card title="最新收盤" value={format(analysis.latest)} />
            <Card title="20日外資合計" value={analysis.foreignBuy20.toLocaleString()} highlight />
            <Card title="20日高點" value={format(analysis.high20)} />
            <Card title="20日低點" value={format(analysis.low20)} />
            <Card title="AI摘要" value={analysis.signal} highlight />
          </section>

          <section style={cardStyle}>
            <h2>技術指標</h2>
            <table style={tableStyle}>
              <tbody>
                <Row label="MA5" value={format(analysis.ma5)} />
                <Row label="MA20" value={format(analysis.ma20)} />
                <Row label="MA60" value={format(analysis.ma60)} />
              </tbody>
            </table>
          </section>

          <section style={cardStyle}>
            <h2>最近20天股價與外資</h2>

            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={th}>日期</th>
                    <th style={th}>開</th>
                    <th style={th}>高</th>
                    <th style={th}>低</th>
                    <th style={th}>收</th>
                    <th style={th}>量</th>
                    <th style={th}>外資買賣超</th>
                  </tr>
                </thead>

                <tbody>
                  {mergedRows.map((r) => (
                    <tr key={r.trade_date}>
                      <td style={td}>{r.trade_date}</td>
                      <td style={numberTd}>{format(r.open)}</td>
                      <td style={numberTd}>{format(r.high)}</td>
                      <td style={numberTd}>{format(r.low)}</td>
                      <td style={numberTd}>{format(r.close)}</td>
                      <td style={numberTd}>{Number(r.volume || 0).toLocaleString()}</td>
                      <td
                        style={{
                          ...numberTd,
                          color:
                            r.foreign_buy == null
                              ? "#999"
                              : Number(r.foreign_buy) >= 0
                              ? "#ff5555"
                              : "#00ff88",
                        }}
                      >
                        {r.foreign_buy == null ? "-" : Number(r.foreign_buy).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section style={cardStyle}>
            <h2>簡易判讀</h2>
            <p>{buildCommentary(analysis)}</p>
          </section>
        </>
      )}
    </main>
  );
}

function buildCommentary(a: any) {
  if (a.signal === "買入") {
    return "目前收盤價站上 MA20，且 MA20 高於 MA60，趨勢偏多。可列為續抱或觀察買入標的。";
  }

  if (a.signal === "賣出") {
    return "目前收盤價低於 MA20，且 MA20 低於 MA60，趨勢偏弱，建議優先檢查停損或減碼條件。";
  }

  if (a.signal === "持有") {
    return "目前趨勢尚未明確轉強或轉弱，建議持有觀察，重點看外資是否持續買超但價格未明顯上漲。";
  }

  return "資料不足，請先更新股價與外資資料。";
}

function format(v: number | null | undefined) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return "-";
  return Number(v).toFixed(2);
}

function Card({ title, value, highlight }: { title: string; value: string; highlight?: boolean }) {
  return (
    <div style={cardStyle}>
      <div style={{ color: "#aaa", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: highlight ? "#facc15" : "#fff" }}>
        {value}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td style={td}>{label}</td>
      <td style={numberTd}>{value}</td>
    </tr>
  );
}

const pageStyle: React.CSSProperties = {
  background: "#050505",
  color: "#fff",
  minHeight: "100vh",
  padding: 20,
  paddingBottom: 80,
  fontSize: "90%",
};

const titleStyle: React.CSSProperties = {
  marginTop: 12,
  marginBottom: 4,
};

const subStyle: React.CSSProperties = {
  color: "#aaa",
  marginBottom: 18,
};

const backButtonStyle: React.CSSProperties = {
  display: "inline-block",
  color: "#38bdf8",
  textDecoration: "none",
  fontWeight: 800,
  marginBottom: 8,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
  marginBottom: 18,
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #333",
  borderRadius: 12,
  background: "#101010",
  padding: 16,
  marginBottom: 18,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 760,
};

const th: React.CSSProperties = {
  border: "1px solid #333",
  padding: 10,
  background: "#1b1b1b",
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  border: "1px solid #333",
  padding: 10,
  whiteSpace: "nowrap",
};

const numberTd: React.CSSProperties = {
  ...td,
  textAlign: "right",
};