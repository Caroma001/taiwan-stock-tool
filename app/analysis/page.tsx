"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("symbol") || "";
    setSymbol(s);

    async function load() {
      setLoading(true);

      const { data, error } = await supabase
        .from("daily_prices")
        .select("*")
        .eq("symbol", s)
        .order("trade_date", { ascending: false })
        .limit(500);

      if (error) {
        alert("讀取分析資料失敗：" + error.message);
      } else {
        setRows((data || []) as DailyPrice[]);
      }

      setLoading(false);
    }

    if (s) load();
  }, []);

  const analysis = useMemo(() => {
    const latest = rows[0]?.close ? Number(rows[0].close) : null;
    const ma5 = calcMA(rows, 5);
    const ma20 = calcMA(rows, 20);
    const ma60 = calcMA(rows, 60);
    const ma240 = calcMA(rows, 240);
    const high60 = rows.slice(0, 60).reduce((m, x) => Math.max(m, Number(x.high || 0)), 0);
    const low60 = rows.slice(0, 60).reduce((m, x) => {
      const v = Number(x.low || 0);
      return v > 0 ? Math.min(m, v) : m;
    }, Number.MAX_SAFE_INTEGER);

    const signal = getSignal(latest, ma20, ma60);

    return {
      latest,
      ma5,
      ma20,
      ma60,
      ma240,
      high60,
      low60: low60 === Number.MAX_SAFE_INTEGER ? null : low60,
      signal,
    };
  }, [rows]);

  return (
    <main style={pageStyle}>
      <h1>📊 個股詳細分析：{symbol}</h1>

      {loading ? (
        <p>讀取中...</p>
      ) : rows.length < 20 ? (
        <section style={cardStyle}>
          <h2>資料不足</h2>
          <p>目前只有 {rows.length} 筆日線資料，請先回 Portfolio 按「下載2年」。</p>
        </section>
      ) : (
        <>
          <section style={gridStyle}>
            <Card title="最新收盤" value={format(analysis.latest)} />
            <Card title="AI摘要" value={analysis.signal} highlight />
            <Card title="60日高點" value={format(analysis.high60)} />
            <Card title="60日低點" value={format(analysis.low60)} />
          </section>

          <section style={cardStyle}>
            <h2>技術指標</h2>
            <table style={tableStyle}>
              <tbody>
                <Row label="MA5" value={format(analysis.ma5)} />
                <Row label="MA20" value={format(analysis.ma20)} />
                <Row label="MA60" value={format(analysis.ma60)} />
                <Row label="MA240" value={format(analysis.ma240)} />
              </tbody>
            </table>
          </section>

          <section style={cardStyle}>
            <h2>詳細分析</h2>
            <p>{buildCommentary(analysis)}</p>
          </section>

          <section style={cardStyle}>
            <h2>最近10筆資料</h2>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={th}>日期</th>
                  <th style={th}>開</th>
                  <th style={th}>高</th>
                  <th style={th}>低</th>
                  <th style={th}>收</th>
                  <th style={th}>量</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map((r) => (
                  <tr key={r.trade_date}>
                    <td style={td}>{r.trade_date}</td>
                    <td style={td}>{format(r.open)}</td>
                    <td style={td}>{format(r.high)}</td>
                    <td style={td}>{format(r.low)}</td>
                    <td style={td}>{format(r.close)}</td>
                    <td style={td}>{Number(r.volume || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </main>
  );
}

function buildCommentary(a: any) {
  if (a.signal === "買入") {
    return `目前收盤價站上 MA20，且 MA20 高於 MA60，趨勢偏多。可列為觀察買入或續抱標的，但仍需搭配量能與大盤狀況。`;
  }

  if (a.signal === "賣出") {
    return `目前收盤價低於 MA20，且 MA20 低於 MA60，趨勢偏弱。建議優先檢查停損、減碼或等待止跌訊號。`;
  }

  if (a.signal === "持有") {
    return `目前趨勢尚未明確轉強或轉弱，建議持有觀察。可重點觀察是否重新站上 MA20，或跌破近期低點。`;
  }

  return "歷史資料不足，請先下載近2年資料後再分析。";
}

function format(v: number | null | undefined) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return "-";
  return Number(v).toFixed(2);
}

function Card({ title, value, highlight }: { title: string; value: string; highlight?: boolean }) {
  return (
    <div style={cardStyle}>
      <div style={{ color: "#aaa", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: highlight ? "#facc15" : "#fff" }}>
        {value}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td style={td}>{label}</td>
      <td style={td}>{value}</td>
    </tr>
  );
}

const pageStyle: React.CSSProperties = {
  background: "#050505",
  color: "#fff",
  minHeight: "100vh",
  padding: 24,
  fontSize: "90%",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
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
};

const th: React.CSSProperties = {
  border: "1px solid #333",
  padding: 10,
  background: "#1b1b1b",
};

const td: React.CSSProperties = {
  border: "1px solid #333",
  padding: 10,
};