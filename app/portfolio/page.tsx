"use client";

import { useCallback, useEffect, useState } from "react";

type HoldingType = "real" | "test";
type ViewFilter = HoldingType | "all";

const money = (value: number | null | undefined) =>
  value == null ? "—" : Math.round(Number(value)).toLocaleString("zh-TW");
const num = (value: number | null | undefined, digits = 2) =>
  value == null
    ? "—"
    : Number(value).toLocaleString("zh-TW", { maximumFractionDigits: digits });

export default function PortfolioPage() {
  const [data, setData] = useState<any>({ rows: [], summary: {} });
  const [filter, setFilter] = useState<ViewFilter>("real");
  const [form, setForm] = useState({
    symbol: "",
    buyPrice: "",
    quantityLots: "",
    buyDate: new Date().toISOString().slice(0, 10),
    targetSellPrice: "",
    fees: "",
    note: "",
    holdingType: "real" as HoldingType,
  });
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const response = await fetch(`/api/portfolio/overview?type=${filter}`, {
      cache: "no-store",
    });
    const payload = await response.json();
    if (payload.ok) setData(payload);
    else setMessage(payload.error);
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    const response = await fetch("/api/portfolio/lots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const payload = await response.json();
    setMessage(
      payload.ok
        ? form.holdingType === "test"
          ? "測試持股已新增，不會混入真實績效統計"
          : "真實持倉批次已新增"
        : payload.error,
    );
    if (payload.ok) {
      setForm((current) => ({
        ...current,
        symbol: "",
        buyPrice: "",
        quantityLots: "",
        targetSellPrice: "",
        fees: "",
        note: "",
      }));
      setFilter(form.holdingType);
      await load();
    }
  }

  async function refreshAIPlans() {
    setMessage("正在重新計算 AI 目標價、停損價與售出建議……");
    const response = await fetch("/api/portfolio/ai-plan/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holdingType: filter === "all" ? "all" : filter }),
    });
    const payload = await response.json();
    setMessage(
      payload.ok
        ? `AI 售出計畫已更新：成功 ${payload.completed} 檔，失敗 ${payload.failed} 檔。`
        : payload.error,
    );
    if (payload.ok) await load();
  }

  async function sell(lot: any) {
    const price = prompt(`賣出 ${lot.symbol} 的價格`);
    if (!price) return;
    const quantity = prompt(
      `賣出張數（最多 ${lot.remaining_lots}）`,
      String(lot.remaining_lots),
    );
    if (!quantity) return;

    const response = await fetch("/api/portfolio/sell", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lotId: lot.id,
        sellPrice: Number(price),
        quantityLots: Number(quantity),
      }),
    });
    const payload = await response.json();
    setMessage(
      payload.ok
        ? `已完成${lot.holding_type === "test" ? "測試" : "真實"}賣出，實現損益 ${money(payload.realizedProfit)} 元`
        : payload.error,
    );
    if (payload.ok) await load();
  }


  async function deleteLot(lot: any) {
    const typeLabel = lot.holding_type === "test" ? "測試持股" : "真實持股";
    const confirmed = window.confirm(
      `確定刪除 ${lot.symbol} 的這筆${typeLabel}嗎？\n\n買進日：${lot.buy_date}\n買進價：${lot.buy_price}\n剩餘張數：${lot.remaining_lots}\n\n此操作只適合修正輸入錯誤，刪除後無法復原。`,
    );
    if (!confirmed) return;

    setMessage(`正在刪除 ${lot.symbol} 的錯誤持股資料……`);

    const response = await fetch("/api/portfolio/lots", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: lot.id }),
    });
    const payload = await response.json();

    setMessage(
      payload.ok
        ? `${lot.symbol} 的${typeLabel}已刪除。`
        : payload.error ?? "刪除持股失敗",
    );

    if (payload.ok) await load();
  }

  const summary = data.summary ?? {};
  const filterLabel =
    filter === "real" ? "真實持股" : filter === "test" ? "測試持股" : "全部持股";

  return (
    <main style={page}>
      <header style={header}>
        <div>
          <div style={eye}>Bruce's 台股決策中心 M7.3 Turso Portfolio</div>
          <h1>持有股票管理</h1>
          <p style={muted}>
            持股、AI 目標價、停損價與歷史交易均已改用 Turso；真實持股與測試持股完全分流。
          </p>
        </div>
        <nav style={nav}>
          <a style={btn} href="/daily-validation">AI 驗證中心</a>
          <a style={btn} href="/trade-history">歷史交易紀錄</a>
          <a style={btn} href="/portfolio-ai-validation">兩週 AI 驗證</a>
          <button style={{ ...btn, background: "#7c3aed" }} onClick={() => void refreshAIPlans()}>AI 重新評估</button>
          <button style={btn} onClick={() => void load()}>重新整理</button>
        </nav>
      </header>

      {message && <div style={notice}>{message}</div>}

      <section style={filterBar}>
        <strong>目前檢視：{filterLabel}</strong>
        <div style={nav}>
          {(["real", "test", "all"] as ViewFilter[]).map((value) => (
            <button
              key={value}
              style={{
                ...btn,
                background: filter === value ? "#2563eb" : "#111827",
              }}
              onClick={() => setFilter(value)}
            >
              {value === "real" ? "真實持股" : value === "test" ? "測試持股" : "全部"}
            </button>
          ))}
        </div>
      </section>

      <section style={cards}>
        {[
          ["總投入成本", `${money(summary.totalCost)} 元`],
          ["目前市值", `${money(summary.marketValue)} 元`],
          ["未實現損益", `${money(summary.unrealizedProfit)} 元`],
          ["未實現報酬", `${num(summary.unrealizedReturnPct)}%`],
        ].map(([label, value]) => (
          <div style={card} key={label}>
            <span style={muted}>{label}</span>
            <strong style={{ fontSize: 26 }}>{value}</strong>
          </div>
        ))}
      </section>

      <section style={panel}>
        <h2>新增一筆買進</h2>
        <div style={typeChooser}>
          <button
            style={{ ...typeButton, ...(form.holdingType === "real" ? activeReal : {}) }}
            onClick={() => setForm({ ...form, holdingType: "real" })}
          >
            真實買進
          </button>
          <button
            style={{ ...typeButton, ...(form.holdingType === "test" ? activeTest : {}) }}
            onClick={() => setForm({ ...form, holdingType: "test" })}
          >
            加入測試股
          </button>
        </div>
        <div style={warningBox}>
          {form.holdingType === "test"
            ? "目前將建立「測試持股」：預期售出價與停損價將由 AI 依最新指標自動產生，不會計入真實績效。"
            : "目前將建立「真實持股」：會計入真實成本、未實現損益與歷史交易績效。"}
        </div>
        <div style={formGrid}>
          {[
            ["symbol", "股票代號"],
            ["buyPrice", "買進價"],
            ["quantityLots", "張數"],
            ["buyDate", "買進日期"],
            ["fees", "買進手續費"],
            ["note", "備註"],
          ].map(([key, placeholder]) => (
            <input
              key={key}
              style={input}
              type={key === "buyDate" ? "date" : key === "note" || key === "symbol" ? "text" : "number"}
              placeholder={placeholder}
              value={(form as any)[key]}
              onChange={(event) => setForm({ ...form, [key]: event.target.value })}
            />
          ))}
        </div>
        <button
          style={{ ...primary, background: form.holdingType === "test" ? "#7c3aed" : "#2563eb" }}
          onClick={add}
        >
          {form.holdingType === "test" ? "加入測試股" : "新增真實持倉"}
        </button>
      </section>

      <section style={panel}>
        <h2>{filterLabel}總覽</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={table}>
            <thead>
              <tr>
                {["類型", "股票", "總張數", "加權成本", "現價", "總成本", "目前市值", "當前獲利", "報酬率", "AI目標價", "AI停損價", "AI建議", "信心", "更新日期"].map((item) => (
                  <th style={th} key={item}>{item}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row: any) => (
                <tr key={`${row.holding_type}-${row.symbol}`}>
                  <td style={td}><TypeBadge type={row.holding_type} /></td>
                  <td style={td}><b>{row.symbol}</b> {row.stock_name}</td>
                  <td style={td}>{num(row.total_lots, 3)}</td>
                  <td style={td}>{num(row.average_cost)}</td>
                  <td style={td}>{num(row.current_price)}</td>
                  <td style={td}>{money(row.total_cost)}</td>
                  <td style={td}>{money(row.market_value)}</td>
                  <td style={{ ...td, color: Number(row.unrealized_profit) >= 0 ? "#4ade80" : "#fb7185" }}>{money(row.unrealized_profit)}</td>
                  <td style={td}>{num(row.unrealized_return_pct)}%</td>
                  <td style={td}>{num(row.ai_target_price)}</td>
                  <td style={{ ...td, color: "#fb7185" }}>{num(row.ai_stop_loss_price)}</td>
                  <td style={td}><ActionBadge action={row.ai_action} /></td>
                  <td style={td}>{row.ai_confidence == null ? "—" : `${num(row.ai_confidence, 0)}%`}</td>
                  <td style={td}>{row.ai_plan_date ?? row.trade_date ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {data.rows.map((row: any) => (
        <section style={panel} key={`${row.holding_type}-${row.symbol}-lots`}>
          <h2><TypeBadge type={row.holding_type} /> {row.symbol} {row.stock_name}－分批購入明細</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  {["買進日", "買進價", "原始張數", "剩餘張數", "AI目標價", "AI停損價", "AI建議", "成本價值", "備註", "操作"].map((item) => (
                    <th style={th} key={item}>{item}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {row.lots.map((lot: any) => (
                  <tr key={lot.id}>
                    <td style={td}>{lot.buy_date}</td>
                    <td style={td}>{num(lot.buy_price)}</td>
                    <td style={td}>{num(lot.quantity_lots, 3)}</td>
                    <td style={td}>{num(lot.remaining_lots, 3)}</td>
                    <td style={td}>{num(lot.ai_plan?.target_price)}</td>
                    <td style={{ ...td, color: "#fb7185" }}>{num(lot.ai_plan?.stop_loss_price)}</td>
                    <td style={td}><ActionBadge action={lot.ai_plan?.action} /></td>
                    <td style={td}>{money(Number(lot.buy_price) * Number(lot.remaining_lots) * 1000)}</td>
                    <td style={td}>{lot.note ?? "—"}</td>
                    <td style={td}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button style={sellBtn} onClick={() => void sell(lot)}>
                          登記{lot.holding_type === "test" ? "測試" : "真實"}賣出
                        </button>
                        <button style={deleteBtn} onClick={() => void deleteLot(lot)}>
                          刪除錯誤持股
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </main>
  );
}

function ActionBadge({ action }: { action: string | null | undefined }) {
  const labels: Record<string, string> = {
    hold: "續抱",
    watch_take_profit: "接近停利",
    take_profit: "建議停利",
    reduce: "減碼觀察",
    stop_loss: "觸發停損",
    sell_signal: "轉弱售出",
  };
  const danger = action === "stop_loss" || action === "sell_signal";
  const positive = action === "take_profit" || action === "watch_take_profit";
  return (
    <span style={{ ...badge, background: danger ? "#7f1d1d" : positive ? "#854d0e" : "#164e63", color: "#f8fafc" }}>
      {action ? labels[action] ?? action : "尚未評估"}
    </span>
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
const notice: React.CSSProperties = { maxWidth: 1500, margin: "0 auto 18px", padding: 14, border: "1px solid #0f766e", borderRadius: 10, background: "#052e2b" };
const filterBar: React.CSSProperties = { maxWidth: 1500, margin: "0 auto 18px", padding: 14, border: "1px solid #334155", borderRadius: 12, background: "#0f172a", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" };
const cards: React.CSSProperties = { maxWidth: 1500, margin: "0 auto 18px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10 };
const card: React.CSSProperties = { background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 7 };
const panel: React.CSSProperties = { maxWidth: 1500, margin: "0 auto 18px", background: "#0f172a", border: "1px solid #1e293b", borderRadius: 14, padding: 18 };
const formGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginBottom: 14 };
const input: React.CSSProperties = { padding: 11, border: "1px solid #334155", borderRadius: 8, background: "#111827", color: "#e5eefc" };
const primary: React.CSSProperties = { ...btn };
const sellBtn: React.CSSProperties = { ...btn, background: "#b45309" };
const deleteBtn: React.CSSProperties = { ...btn, background: "#7f1d1d", borderColor: "#be123c" };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 1100 };
const th: React.CSSProperties = { padding: 10, textAlign: "left", borderBottom: "1px solid #334155", color: "#94a3b8" };
const td: React.CSSProperties = { padding: 10, borderBottom: "1px solid #1e293b" };
const typeChooser: React.CSSProperties = { display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" };
const typeButton: React.CSSProperties = { ...btn, minWidth: 150 };
const activeReal: React.CSSProperties = { background: "#047857", borderColor: "#10b981" };
const activeTest: React.CSSProperties = { background: "#6d28d9", borderColor: "#8b5cf6" };
const warningBox: React.CSSProperties = { padding: 12, borderRadius: 9, background: "#111827", border: "1px solid #334155", color: "#cbd5e1", marginBottom: 14 };
const badge: React.CSSProperties = { display: "inline-block", padding: "3px 8px", borderRadius: 999, fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" };
