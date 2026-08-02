"use client";

import { useCallback, useEffect, useState } from "react";

type Filter = "real" | "test" | "all";
const money = (value: unknown) => Math.round(Number(value ?? 0)).toLocaleString("zh-TW");
const num = (value: unknown) => Number(value ?? 0).toFixed(2);

export default function TradeHistoryPage() {
  const [data, setData] = useState<any>({ rows: [], summary: {} });
  const [filter, setFilter] = useState<Filter>("real");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const response = await fetch(`/api/trade-history?type=${filter}`, { cache: "no-store" });
    const payload = await response.json();
    if (payload.ok) setData(payload);
    else setMessage(payload.error);
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = data.summary ?? {};
  const title = filter === "real" ? "真實交易" : filter === "test" ? "測試交易" : "全部交易";

  return (
    <main style={page}>
      <header style={header}>
        <div>
          <div style={eye}>twstock M7.4.3 · Turso</div>
          <h1>歷史交易紀錄</h1>
          <p style={muted}>真實交易與測試交易分開統計，預設只顯示真實已實現損益。</p>
        </div>
        <nav style={nav}>
          <a style={btn} href="/portfolio">持股管理</a>
          <a style={btn} href="/daily-validation">AI 驗證中心</a>
          <button style={btn} onClick={() => void load()}>重新整理</button>
        </nav>
      </header>

      {message && <div style={notice}>{message}</div>}

      <section style={filterBar}>
        <strong>目前統計：{title}</strong>
        <div style={nav}>
          {(["real", "test", "all"] as Filter[]).map((value) => (
            <button
              key={value}
              style={{ ...btn, background: filter === value ? "#2563eb" : "#111827" }}
              onClick={() => setFilter(value)}
            >
              {value === "real" ? "真實交易" : value === "test" ? "測試交易" : "全部"}
            </button>
          ))}
        </div>
      </section>

      <section style={cards}>
        {[
          ["交易筆數", summary.trades ?? 0],
          ["累計實現損益", `${money(summary.totalProfit)} 元`],
          ["勝率", `${num(summary.winRate)}%`],
          ["平均報酬率", `${num(summary.averageReturn)}%`],
        ].map(([label, value]) => (
          <div style={card} key={String(label)}>
            <span style={muted}>{label}</span>
            <strong style={{ fontSize: 26 }}>{value}</strong>
          </div>
        ))}
      </section>

      <section style={panel}>
        <div style={{ overflowX: "auto" }}>
          <table style={table}>
            <thead>
              <tr>
                {["類型", "賣出日", "股票", "買進日", "買進價", "賣出價", "張數", "成本", "賣出總額", "費用與稅", "實際獲利", "實際報酬", "備註"].map((item) => (
                  <th style={th} key={item}>{item}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row: any) => (
                <tr key={row.id}>
                  <td style={td}><TypeBadge type={row.holding_type} /></td>
                  <td style={td}>{row.sell_date}</td>
                  <td style={td}><b>{row.symbol}</b> {row.stock_name}</td>
                  <td style={td}>{row.buy_date}</td>
                  <td style={td}>{num(row.buy_price)}</td>
                  <td style={td}>{num(row.sell_price)}</td>
                  <td style={td}>{num(row.quantity_lots)}</td>
                  <td style={td}>{money(row.gross_cost)}</td>
                  <td style={td}>{money(row.gross_proceeds)}</td>
                  <td style={td}>{money(Number(row.buy_fees) + Number(row.sell_fees) + Number(row.transaction_tax))}</td>
                  <td style={{ ...td, color: Number(row.realized_profit) >= 0 ? "#4ade80" : "#fb7185" }}>{money(row.realized_profit)}</td>
                  <td style={td}>{num(row.realized_return_pct)}%</td>
                  <td style={td}>{row.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.rows.length === 0 && <p style={muted}>尚無{title}紀錄。</p>}
        </div>
      </section>
    </main>
  );
}

function TypeBadge({ type }: { type: string }) {
  const test = type === "test";
  return (
    <span style={{ ...badge, background: test ? "#5b21b6" : "#065f46", color: test ? "#ede9fe" : "#d1fae5" }}>
      {test ? "測試" : "真實"}
    </span>
  );
}

const page: React.CSSProperties = { minHeight: "100vh", background: "#020617", color: "#e5eefc", padding: 28 };
const header: React.CSSProperties = { maxWidth: 1500, margin: "0 auto 20px", display: "flex", justifyContent: "space-between", gap: 20, flexWrap: "wrap" };
const eye = { color: "#22d3ee", fontWeight: 800 };
const muted = { color: "#94a3b8" };
const nav: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap" };
const btn: React.CSSProperties = { padding: "10px 14px", border: "1px solid #334155", borderRadius: 9, color: "#e5eefc", background: "#111827", textDecoration: "none", cursor: "pointer" };
const notice: React.CSSProperties = { maxWidth: 1500, margin: "0 auto 18px", padding: 14, border: "1px solid #be123c", borderRadius: 10, background: "#4c0519" };
const filterBar: React.CSSProperties = { maxWidth: 1500, margin: "0 auto 18px", padding: 14, border: "1px solid #334155", borderRadius: 12, background: "#0f172a", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" };
const cards: React.CSSProperties = { maxWidth: 1500, margin: "0 auto 18px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10 };
const card: React.CSSProperties = { background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 7 };
const panel: React.CSSProperties = { maxWidth: 1500, margin: "0 auto", background: "#0f172a", border: "1px solid #1e293b", borderRadius: 14, padding: 18 };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 1280 };
const th: React.CSSProperties = { padding: 10, textAlign: "left", borderBottom: "1px solid #334155", color: "#94a3b8" };
const td: React.CSSProperties = { padding: 10, borderBottom: "1px solid #1e293b" };
const badge: React.CSSProperties = { display: "inline-block", padding: "3px 8px", borderRadius: 999, fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" };
