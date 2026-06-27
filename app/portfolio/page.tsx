"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabase";
import PortfolioTable from "@/app/components/PortfolioTable";
import type { PortfolioRow } from "@/app/types/stock";

type ProgressState = {
  active: boolean;
  label: string;
  percent: number;
};

export default function PortfolioPage() {
  const [rows, setRows] = useState<PortfolioRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [progress, setProgress] = useState<ProgressState>({
    active: false,
    label: "",
    percent: 0,
  });

  const [symbol, setSymbol] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [shares, setShares] = useState("");
  const [note, setNote] = useState("");

  async function loadPortfolio() {
    setLoading(true);

    const { data: positions, error } = await supabase
      .from("user_positions")
      .select("*")
      .eq("user_name", "Bruce")
      .order("symbol");

    if (error) {
      alert("讀取持股失敗：" + error.message);
      setLoading(false);
      return;
    }

    const result: PortfolioRow[] = [];

    for (const p of positions ?? []) {
      const { data: stock } = await supabase
        .from("stocks")
        .select("*")
        .eq("symbol", p.symbol)
        .maybeSingle();

      const { data: price } = await supabase
        .from("daily_prices")
        .select("*")
        .eq("symbol", p.symbol)
        .order("trade_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { count: historyCount } = await supabase
        .from("daily_prices")
        .select("*", { count: "exact", head: true })
        .eq("symbol", p.symbol);

      const { data: aiScore } = await supabase
        .from("ai_scores")
        .select("*")
        .eq("user_name", "Bruce")
        .eq("symbol", p.symbol)
        .maybeSingle();

      const close =
        price?.close !== undefined && price?.close !== null
          ? Number(price.close)
          : null;

      const buy = Number(p.buy_price);
      const shareCount = Number(p.shares);

      const profit =
        close !== null ? Math.round((close - buy) * shareCount * 1000) : null;

      const profitPercent = close !== null ? ((close - buy) / buy) * 100 : null;

      result.push({
        id: p.id,
        symbol: p.symbol,
        name: stock?.name || p.note || "",
        market: stock?.market || "",
        buy_price: buy,
        shares: shareCount,
        close,
        trade_date: price?.trade_date ?? null,
        profit,
        profitPercent,
        historyCount: historyCount ?? 0,
        hasTwoYearHistory: (historyCount ?? 0) >= 400,
        aiScore: aiScore?.score ?? null,
        aiSignal: aiScore?.signal ?? null,
        aiSummary: aiScore?.summary ?? null,
        aiRiskLevel: aiScore?.risk_level ?? null,
      });
    }

    setRows(result);
    setLoading(false);
  }

  async function saveLatestPrice(cleanSymbol: string, stockData: any) {
    if (!stockData?.close) return;

    await supabase.from("daily_prices").upsert(
      {
        symbol: cleanSymbol,
        trade_date:
          stockData.trade_date ||
          stockData.date ||
          new Date().toISOString().slice(0, 10),
        open: stockData.open ?? null,
        high: stockData.high ?? stockData.max ?? null,
        low: stockData.low ?? stockData.min ?? null,
        close: Number(stockData.close),
        volume: stockData.volume ?? null,
      },
      { onConflict: "symbol,trade_date" }
    );
  }

  async function addPosition() {
    if (!symbol || !buyPrice || !shares) {
      alert("請輸入股票代號、買進價、張數");
      return;
    }

    const cleanSymbol = symbol.trim();

    setProgress({
      active: true,
      label: `新增 ${cleanSymbol} 中...`,
      percent: 10,
    });

    try {
      const stockRes = await fetch(`/api/stock?symbol=${cleanSymbol}`);
      const stockData = await stockRes.json();

      if (!stockRes.ok) {
        alert("取得股票資料失敗：" + (stockData.error || "未知錯誤"));
        setProgress({ active: false, label: "", percent: 0 });
        return;
      }

      setProgress({
        active: true,
        label: `寫入 ${cleanSymbol} 資料...`,
        percent: 45,
      });

      await supabase.from("stocks").upsert({
        symbol: cleanSymbol,
        name: stockData?.name || note || cleanSymbol,
        market: stockData?.market || "UNKNOWN",
        industry: stockData?.industry || "",
        is_active: true,
      });

      const { error } = await supabase.from("user_positions").upsert(
        {
          user_name: "Bruce",
          symbol: cleanSymbol,
          buy_price: Number(buyPrice),
          shares: Number(shares),
          buy_date: new Date().toISOString().slice(0, 10),
          note,
        },
        { onConflict: "user_name,symbol" }
      );

      if (error) {
        alert("新增失敗：" + error.message);
        setProgress({ active: false, label: "", percent: 0 });
        return;
      }

      setProgress({
        active: true,
        label: `寫入 ${cleanSymbol} 最新收盤價...`,
        percent: 80,
      });

      await saveLatestPrice(cleanSymbol, stockData);

      setSymbol("");
      setBuyPrice("");
      setShares("");
      setNote("");

      await loadPortfolio();

      setProgress({
        active: true,
        label: "完成",
        percent: 100,
      });

      setTimeout(() => {
        setProgress({ active: false, label: "", percent: 0 });
      }, 900);
    } catch (error) {
      alert("新增失敗：" + String(error));
      setProgress({ active: false, label: "", percent: 0 });
    }
  }

  async function deletePosition(row: PortfolioRow) {
    const ok = confirm(`確定刪除 ${row.symbol} ${row.name} 嗎？`);
    if (!ok) return;

    const { error } = await supabase
      .from("user_positions")
      .delete()
      .eq("id", row.id);

    if (error) {
      alert("刪除失敗：" + error.message);
      return;
    }

    await loadPortfolio();
  }

  async function downloadHistory(row: PortfolioRow) {
    if (row.hasTwoYearHistory) {
      alert(`${row.symbol} 已有2年資料，不需要重複下載。`);
      return;
    }

    const ok = confirm(`確定下載 ${row.symbol} ${row.name} 近 2 年歷史資料嗎？`);
    if (!ok) return;

    setProgress({
      active: true,
      label: `下載 ${row.symbol} 近2年資料中...`,
      percent: 10,
    });

    try {
      const res = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: row.symbol,
          market: row.market,
        }),
      });

      setProgress({
        active: true,
        label: `整理 ${row.symbol} 歷史資料...`,
        percent: 70,
      });

      const data = await res.json();

      if (!res.ok) {
        alert("下載失敗：" + (data.error || data.message || "未知錯誤"));
        setProgress({ active: false, label: "", percent: 0 });
        return;
      }

      await loadPortfolio();

      setProgress({
        active: true,
        label: `${row.symbol} 下載完成，共寫入 ${data.inserted ?? 0} 筆資料`,
        percent: 100,
      });

      setTimeout(() => {
        setProgress({ active: false, label: "", percent: 0 });
      }, 1200);
    } catch (error) {
      alert("下載失敗：" + String(error));
      setProgress({ active: false, label: "", percent: 0 });
    }
  }

  async function updatePrices() {
    if (!rows.length) return;

    setUpdating(true);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      setProgress({
        active: true,
        label: `更新 ${row.symbol} ${row.name} 股價中...`,
        percent: Math.max(5, Math.round((i / rows.length) * 90)),
      });

      try {
        const res = await fetch(`/api/stock?symbol=${row.symbol}`);
        const data = await res.json();

        if (!res.ok || !data?.close) continue;

        await supabase.from("stocks").upsert({
          symbol: row.symbol,
          name: data.name || row.name || row.symbol,
          market: data.market || row.market || "UNKNOWN",
          industry: data.industry || "",
          is_active: true,
        });

        await saveLatestPrice(row.symbol, data);
      } catch (error) {
        console.error(row.symbol, error);
      }
    }

    await loadPortfolio();

    setProgress({
      active: true,
      label: "股價更新完成",
      percent: 100,
    });

    setUpdating(false);

    setTimeout(() => {
      setProgress({ active: false, label: "", percent: 0 });
    }, 1000);
  }

  async function runAiScore() {
    setProgress({
      active: true,
      label: "AI 重新分析中...",
      percent: 15,
    });

    try {
      const res = await fetch("/api/ai-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      setProgress({
        active: true,
        label: "AI 分析結果寫入中...",
        percent: 75,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        alert("AI 分析失敗：" + (data.error || "未知錯誤"));
        setProgress({ active: false, label: "", percent: 0 });
        return;
      }

      await loadPortfolio();

      setProgress({
        active: true,
        label: `AI 分析完成，共分析 ${data.count ?? 0} 檔`,
        percent: 100,
      });

      setTimeout(() => {
        setProgress({ active: false, label: "", percent: 0 });
      }, 1200);
    } catch (error) {
      alert("AI 分析失敗：" + String(error));
      setProgress({ active: false, label: "", percent: 0 });
    }
  }

  useEffect(() => {
    loadPortfolio();
  }, []);

  const totalCost = rows.reduce(
    (sum, row) => sum + row.buy_price * row.shares * 1000,
    0
  );

  const totalMarketValue = rows.reduce(
    (sum, row) =>
      sum + (row.close !== null ? row.close * row.shares * 1000 : 0),
    0
  );

  const totalProfit = rows.reduce((sum, row) => sum + (row.profit ?? 0), 0);

  const totalReturn = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;

  return (
    <main style={pageStyle}>
      <h1 style={{ marginTop: 0, marginBottom: 16 }}>💼 Portfolio 持股管理</h1>

      <section style={gridStyle}>
        <SummaryCard
          title="投入成本"
          value={`${Math.round(totalCost).toLocaleString()} 元`}
        />

        <SummaryCard
          title="目前市值"
          value={`${Math.round(totalMarketValue).toLocaleString()} 元`}
        />

        <SummaryCard
          title="目前總損益"
          value={`${Math.round(totalProfit).toLocaleString()} 元`}
          positive={totalProfit >= 0}
        />

        <SummaryCard
          title="總報酬率"
          value={`${totalReturn.toFixed(2)} %`}
          positive={totalReturn >= 0}
        />
      </section>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>新增 / 更新持股</h2>

        <div style={formGridStyle}>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="股票代號，例如 2337"
            style={inputStyle}
          />

          <input
            value={buyPrice}
            onChange={(e) => setBuyPrice(e.target.value)}
            placeholder="買進價，例如 168.5"
            type="number"
            style={inputStyle}
          />

          <input
            value={shares}
            onChange={(e) => setShares(e.target.value)}
            placeholder="張數，例如 1"
            type="number"
            style={inputStyle}
          />

          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="備註，例如 旺宏"
            style={inputStyle}
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <button onClick={addPosition} style={buttonStyle}>
            ➕ 新增 / 更新持股
          </button>

          <button onClick={updatePrices} style={buttonStyle} disabled={updating}>
            {updating ? "更新中..." : "🔄 更新目前股價"}
          </button>

          <button onClick={runAiScore} style={aiButtonStyle}>
            🤖 AI重新分析
          </button>

          <button onClick={loadPortfolio} style={buttonStyle}>
            重新整理
          </button>
        </div>
      </section>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>我的持股</h2>

        {loading ? (
          <p>讀取中...</p>
        ) : (
          <PortfolioTable
            rows={rows}
            onDelete={deletePosition}
            onDownloadHistory={downloadHistory}
          />
        )}
      </section>

      {progress.active && (
        <section style={progressBoxStyle}>
          <div style={{ marginBottom: 7 }}>{progress.label}</div>
          <div style={progressTrackStyle}>
            <div
              style={{
                ...progressBarStyle,
                width: `${progress.percent}%`,
              }}
            />
          </div>
          <div style={{ marginTop: 5, color: "#aaa" }}>{progress.percent}%</div>
        </section>
      )}
    </main>
  );
}

function SummaryCard({
  title,
  value,
  positive,
}: {
  title: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div style={summaryCardStyle}>
      <div style={{ color: "#aaa", marginBottom: 6 }}>{title}</div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 700,
          color:
            positive === undefined
              ? "#fff"
              : positive
              ? "#ff5555"
              : "#00ff88",
        }}
      >
        {value}
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  background: "#050505",
  color: "#fff",
  minHeight: "100vh",
  padding: 24,
  paddingBottom: 90,
  fontSize: "80%",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
  marginBottom: 18,
};

const summaryCardStyle: React.CSSProperties = {
  border: "1px solid #333",
  borderRadius: 12,
  background: "#101010",
  padding: 16,
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #333",
  borderRadius: 12,
  background: "#0b0b0b",
  padding: 16,
  marginBottom: 18,
};

const formGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
};

const inputStyle: React.CSSProperties = {
  padding: 10,
  color: "#fff",
  background: "#111827",
  border: "1px solid #555",
  borderRadius: 8,
  fontSize: 13,
};

const buttonStyle: React.CSSProperties = {
  padding: "8px 13px",
  marginRight: 8,
  marginBottom: 8,
  background: "#2563eb",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
};

const aiButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "#7c3aed",
};

const progressBoxStyle: React.CSSProperties = {
  position: "fixed",
  left: 24,
  right: 24,
  bottom: 18,
  zIndex: 9999,
  border: "1px solid #333",
  borderRadius: 14,
  background: "#101010",
  padding: 14,
  boxShadow: "0 8px 30px rgba(0,0,0,0.45)",
};

const progressTrackStyle: React.CSSProperties = {
  width: "100%",
  height: 8,
  background: "#1f2937",
  borderRadius: 999,
  overflow: "hidden",
};

const progressBarStyle: React.CSSProperties = {
  height: "100%",
  background: "#7c3aed",
  borderRadius: 999,
  transition: "width 0.3s ease",
};