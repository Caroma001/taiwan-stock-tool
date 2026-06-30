"use client";

import { useEffect, useState } from "react";

type WatchRow = {
  id?: number;
  symbol: string;
  name: string;
  market: string | null;
  sector: string | null;
  group_name: string | null;
  priority: number | null;
  notify: boolean | null;
  enabled: boolean | null;
  close: number | null;
  ma5: number | null;
  ma20: number | null;
  ma60: number | null;
  trend: string | null;
};

function starText(priority: number | null) {
  const n = Math.max(1, Math.min(5, Number(priority ?? 3)));
  return "★".repeat(n) + "☆".repeat(5 - n);
}

function formatPrice(v: number | null) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return "-";
  return Number(v).toFixed(2);
}

function trendColor(trend: string | null) {
  if (trend === "多頭排列") return "#ff5555";
  if (trend === "偏多") return "#facc15";
  if (trend === "跌破MA20") return "#00ff88";
  return "#aaa";
}

export default function WatchlistPage() {
  const [rows, setRows] = useState<WatchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [sector, setSector] = useState("");
  const [groupName, setGroupName] = useState("");
  const [priority, setPriority] = useState("3");

  async function loadWatchlist() {
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/watchlist", { cache: "no-store" });
      const json = await res.json();

      if (!res.ok || !json.success) {
        setMessage("讀取失敗：" + (json.error || "未知錯誤"));
        return;
      }

      setRows(json.data ?? []);
    } catch (error) {
      setMessage("讀取失敗：" + String(error));
    } finally {
      setLoading(false);
    }
  }

  async function addWatch() {
    if (!symbol.trim()) {
      alert("請輸入股票代號");
      return;
    }

    setLoading(true);
    setMessage(`新增 ${symbol.trim()} 中...`);

    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: symbol.trim(),
          name: name.trim(),
          sector: sector.trim(),
          groupName: groupName.trim(),
          priority: Number(priority),
          market: "UNKNOWN",
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setMessage("新增失敗：" + (json.error || "未知錯誤"));
        return;
      }

      setSymbol("");
      setName("");
      setSector("");
      setGroupName("");
      setPriority("3");

      setMessage(json.message || "新增完成");
      await loadWatchlist();
    } catch (error) {
      setMessage("新增失敗：" + String(error));
    } finally {
      setLoading(false);
    }
  }

  async function disableWatch(symbol: string) {
    const ok = confirm(`確定停用 ${symbol} 嗎？`);
    if (!ok) return;

    setLoading(true);
    setMessage(`停用 ${symbol} 中...`);

    try {
      const res = await fetch(`/api/watchlist?symbol=${symbol}`, {
        method: "DELETE",
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setMessage("停用失敗：" + (json.error || "未知錯誤"));
        return;
      }

      setMessage(json.message || "已停用");
      await loadWatchlist();
    } catch (error) {
      setMessage("停用失敗：" + String(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadWatchlist();
  }, []);

  return (
    <main style={pageStyle}>
      <a href="/dashboard" style={homeButtonStyle}>
        ← 回到 AI 投資首頁
      </a>

      <h1 style={titleStyle}>⭐ Watch Radar 觀察池</h1>
      <p style={subStyle}>
        追蹤 Bruce 指定股票，顯示收盤價、MA5、MA20、MA60 與趨勢。
      </p>

      <section style={cardStyle}>
        <h2 style={h2Style}>新增觀察股</h2>

        <div style={formGridStyle}>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="股票代號，例如 3491"
            style={inputStyle}
          />

          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="股票名稱，例如 昇達科"
            style={inputStyle}
          />

          <input
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            placeholder="產業，例如 通信網路"
            style={inputStyle}
          />

          <input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="群組，例如 低軌衛星"
            style={inputStyle}
          />

          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            style={inputStyle}
          >
            <option value="5">★★★★★ 最高關注</option>
            <option value="4">★★★★☆ 重點觀察</option>
            <option value="3">★★★☆☆ 一般觀察</option>
            <option value="2">★★☆☆☆ 低度觀察</option>
            <option value="1">★☆☆☆☆ 暫時觀察</option>
          </select>
        </div>

        <button onClick={addWatch} disabled={loading} style={buttonStyle}>
          ➕ 加入觀察池
        </button>

        <button onClick={loadWatchlist} disabled={loading} style={grayButtonStyle}>
          🔄 重新整理
        </button>

        {message && <div style={messageStyle}>{message}</div>}
      </section>

      <section style={cardStyle}>
        <h2 style={h2Style}>我的觀察清單</h2>

        {loading ? (
          <p>讀取中...</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={th}>股票</th>
                  <th style={th}>名稱</th>
                  <th style={th}>產業</th>
                  <th style={th}>群組</th>
                  <th style={th}>收盤價</th>
                  <th style={th}>MA5</th>
                  <th style={th}>MA20</th>
                  <th style={th}>MA60</th>
                  <th style={th}>趨勢</th>
                  <th style={th}>Priority</th>
                  <th style={th}>通知</th>
                  <th style={th}>狀態</th>
                  <th style={th}>操作</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row) => (
                  <tr key={row.symbol}>
                    <td style={td}>
                      <a
                        href={`/analysis?symbol=${row.symbol}`}
                        style={symbolLinkStyle}
                      >
                        {row.symbol}
                      </a>
                    </td>
                    <td style={td}>{row.name}</td>
                    <td style={td}>{row.sector || "-"}</td>
                    <td style={td}>
                      <span style={groupBadgeStyle}>
                        {row.group_name || "-"}
                      </span>
                    </td>
                    <td style={numberTd}>{formatPrice(row.close)}</td>
                    <td style={numberTd}>{formatPrice(row.ma5)}</td>
                    <td style={numberTd}>{formatPrice(row.ma20)}</td>
                    <td style={numberTd}>{formatPrice(row.ma60)}</td>
                    <td style={{ ...td, color: trendColor(row.trend), fontWeight: 800 }}>
                      {row.trend || "資料不足"}
                    </td>
                    <td style={starTd}>{starText(row.priority)}</td>
                    <td style={td}>{row.notify ? "✅" : "-"}</td>
                    <td style={td}>{row.enabled ? "啟用" : "停用"}</td>
                    <td style={td}>
                      <button
                        type="button"
                        style={dangerButtonStyle}
                        onClick={() => disableWatch(row.symbol)}
                      >
                        停用
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  background: "#050505",
  color: "#fff",
  minHeight: "100vh",
  padding: 28,
  paddingBottom: 80,
};

const homeButtonStyle: React.CSSProperties = {
  display: "inline-block",
  marginBottom: 18,
  padding: "12px 18px",
  borderRadius: 14,
  color: "#fff",
  fontWeight: 900,
  textDecoration: "none",
  background: "linear-gradient(180deg, #38bdf8 0%, #2563eb 100%)",
  boxShadow: "0 6px 0 #1e3a8a, 0 10px 18px rgba(37, 99, 235, 0.45)",
  border: "1px solid #60a5fa",
};

const titleStyle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 8,
  fontSize: 32,
  fontWeight: 900,
};

const subStyle: React.CSSProperties = {
  color: "#aaa",
  marginBottom: 22,
};

const h2Style: React.CSSProperties = {
  marginTop: 0,
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #333",
  borderRadius: 16,
  background: "#0b0b0b",
  padding: 20,
  marginBottom: 22,
};

const formGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
  marginBottom: 14,
};

const inputStyle: React.CSSProperties = {
  padding: 12,
  color: "#fff",
  background: "#111827",
  border: "1px solid #555",
  borderRadius: 10,
  fontSize: 14,
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 16px",
  marginRight: 10,
  marginBottom: 10,
  background: "#2563eb",
  color: "#fff",
  border: "none",
  borderRadius: 10,
  cursor: "pointer",
  fontWeight: 800,
};

const grayButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "#374151",
};

const dangerButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "#991b1b",
};

const messageStyle: React.CSSProperties = {
  color: "#facc15",
  marginTop: 10,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  background: "#111",
  color: "#fff",
  minWidth: 1180,
};

const th: React.CSSProperties = {
  border: "1px solid #333",
  padding: 12,
  background: "#1b1b1b",
  fontWeight: 800,
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

const symbolLinkStyle: React.CSSProperties = {
  color: "#38bdf8",
  fontWeight: 900,
  textDecoration: "none",
};

const groupBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "5px 10px",
  borderRadius: 999,
  border: "1px solid #a16207",
  background: "rgba(250, 204, 21, 0.12)",
  color: "#facc15",
};

const starTd: React.CSSProperties = {
  ...td,
  color: "#facc15",
  fontSize: 20,
  textShadow: "0 0 8px rgba(250,204,21,0.9)",
};