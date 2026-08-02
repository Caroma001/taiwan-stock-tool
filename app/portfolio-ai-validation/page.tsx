"use client";

import { useCallback, useEffect, useState } from "react";

const money = (value: unknown) => value == null ? "—" : Number(value).toLocaleString("zh-TW", { maximumFractionDigits: 2 });
const actionLabel: Record<string, string> = {
  hold: "續抱",
  watch_take_profit: "接近停利",
  take_profit: "建議停利",
  reduce: "減碼觀察",
  stop_loss: "觸發停損",
  sell_signal: "轉弱售出",
};

export default function PortfolioAIValidationPage() {
  const [data, setData] = useState<any>({ rows: [], summary: {} });
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/portfolio/ai-plan/history?days=14", { cache: "no-store" });
    const payload = await response.json();
    if (payload.ok) setData(payload);
    else setMessage(payload.error);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function refresh() {
    setMessage("正在重新計算測試持股的 AI 目標價與停損價……");
    const response = await fetch("/api/portfolio/ai-plan/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holdingType: "test" }),
    });
    const payload = await response.json();
    setMessage(payload.ok ? `更新完成：成功 ${payload.completed}，失敗 ${payload.failed}` : payload.error);
    if (payload.ok) await load();
  }

  const summary = data.summary ?? {};
  return (
    <main style={page}>
      <header style={header}>
        <div>
          <div style={eye}>TSDE M4.3 Two-Week AI Exit Validation</div>
          <h1>測試持股兩週 AI 售出驗證</h1>
          <p style={muted}>每日記錄 AI 目標價、停損價與建議動作。此頁只做模擬驗證，不會自動下單。</p>
        </div>
        <nav style={nav}>
          <a href="/portfolio" style={btn}>持股管理</a>
          <a href="/trade-history" style={btn}>交易紀錄</a>
          <button style={{ ...btn, background: "#7c3aed" }} onClick={() => void refresh()}>重新評估測試股</button>
        </nav>
      </header>

      {message && <div style={notice}>{message}</div>}

      <section style={cards}>
        {[
          ["14 日觀察筆數", summary.observations ?? 0],
          ["停利訊號", summary.takeProfitSignals ?? 0],
          ["停損訊號", summary.stopLossSignals ?? 0],
          ["續抱訊號", summary.holdSignals ?? 0],
          ["平均信心", `${money(summary.averageConfidence)}%`],
        ].map(([label, value]) => (
          <article style={card} key={String(label)}><span style={muted}>{label}</span><strong style={{ fontSize: 25 }}>{value}</strong></article>
        ))}
      </section>

      <section style={panel}>
        <h2>每日 AI 售出計畫紀錄</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={table}>
            <thead><tr>{["日期","股票","現價","買進價","目標價","停損價","預期報酬","最大風險","AI分數","AI建議","信心","有效至"].map((h)=><th style={th} key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {(data.rows ?? []).map((row: any) => (
                <tr key={row.id}>
                  <td style={td}>{row.plan_date}</td>
                  <td style={td}><b>{row.symbol}</b></td>
                  <td style={td}>{money(row.current_price)}</td>
                  <td style={td}>{money(row.entry_price)}</td>
                  <td style={{ ...td, color: "#4ade80" }}>{money(row.target_price)}</td>
                  <td style={{ ...td, color: "#fb7185" }}>{money(row.stop_loss_price)}</td>
                  <td style={td}>{money(row.expected_return_pct)}%</td>
                  <td style={td}>{money(row.max_risk_pct)}%</td>
                  <td style={td}>{row.ai_score ?? "—"}</td>
                  <td style={td}>{actionLabel[row.action] ?? row.action}</td>
                  <td style={td}>{money(row.confidence)}%</td>
                  <td style={td}>{row.valid_until}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!(data.rows ?? []).length && <p style={muted}>尚無紀錄。先在持股管理加入測試股，再按「重新評估測試股」。</p>}
        </div>
      </section>

      <section style={panel}>
        <h2>判讀原則</h2>
        <p style={muted}>目標價綜合 AI 分數、ATR、布林上軌，並限制在買進價上方約 10%～25%。停損價同時考慮 -8% 硬停損與 MA20／MA60 技術支撐。任何建議都只是決策輔助；兩週樣本仍不足以證明長期勝率。</p>
      </section>
    </main>
  );
}

const page: React.CSSProperties = { minHeight: "100vh", background: "#020617", color: "#e5eefc", padding: 28 };
const header: React.CSSProperties = { maxWidth: 1500, margin: "0 auto 20px", display: "flex", justifyContent: "space-between", gap: 20, flexWrap: "wrap" };
const eye = { color: "#22d3ee", fontWeight: 800 };
const muted = { color: "#94a3b8" };
const nav: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap" };
const btn: React.CSSProperties = { padding: "10px 14px", border: "1px solid #334155", borderRadius: 9, color: "#e5eefc", background: "#111827", textDecoration: "none", cursor: "pointer" };
const notice: React.CSSProperties = { maxWidth: 1500, margin: "0 auto 18px", padding: 14, border: "1px solid #0f766e", borderRadius: 10, background: "#052e2b" };
const cards: React.CSSProperties = { maxWidth: 1500, margin: "0 auto 18px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 };
const card: React.CSSProperties = { background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 7 };
const panel: React.CSSProperties = { maxWidth: 1500, margin: "0 auto 18px", background: "#0f172a", border: "1px solid #1e293b", borderRadius: 14, padding: 18 };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 1100 };
const th: React.CSSProperties = { padding: 10, textAlign: "left", borderBottom: "1px solid #334155", color: "#94a3b8" };
const td: React.CSSProperties = { padding: 10, borderBottom: "1px solid #1e293b" };
