"use client";

import { useEffect, useState } from "react";
import StarRating from "@/app/components/StarRating";

type WatchRow = {
  id: number;
  symbol: string;
  name: string;
  market: string | null;
  sector: string | null;
  group_name: string | null;
  priority: number | null;
  reason: string | null;
  notify: boolean | null;
  enabled: boolean | null;
};

export default function WatchlistPage() {
  const [rows, setRows] = useState<WatchRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [sector, setSector] = useState("");
  const [groupName, setGroupName] = useState("");
  const [priority, setPriority] = useState("3");

  async function loadWatchlist() {
    setLoading(true);

    const res = await fetch("/api/watchlist");
    const data = await res.json();

    if (!data.success) {
      alert("讀取 Watchlist 失敗：" + (data.error || "未知錯誤"));
      setLoading(false);
      return;
    }

    setRows(data.data || []);
    setLoading(false);
  }

  async function addWatch() {
    if (!symbol.trim()) {
      alert("請輸入股票代號");
      return;
    }

    const res = await fetch("/api/watchlist", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        symbol: symbol.trim(),
        name: name.trim(),
        sector: sector.trim(),
        groupName: groupName.trim(),
        priority: Number(priority),
      }),
    });

    const data = await res.json();

    if (!data.success) {
      alert("新增失敗：" + (data.error || "未知錯誤"));
      return;
    }

    setSymbol("");
    setName("");
    setSector("");
    setGroupName("");
    setPriority("3");

    await loadWatchlist();
  }

  async function removeWatch(row: WatchRow) {
    const ok = confirm(`確定停用 ${row.symbol} ${row.name} 嗎？`);
    if (!ok) return;

    const res = await fetch(`/api/watchlist?symbol=${row.symbol}`, {
      method: "DELETE",
    });

    const data = await res.json();

    if (!data.success) {
      alert("停用失敗：" + (data.error || "未知錯誤"));
      return;
    }

    await loadWatchlist();
  }

  useEffect(() => {
    loadWatchlist();
  }, []);

  return (
    <main style={pageStyle}>
      <h1 style={titleStyle}>⭐ Watch Radar 觀察池</h1>
      <p style={subStyle}>
        追蹤 Bruce 指定股票，後續會接入外資 20 日吸籌分析 AIS。
      </p>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>新增觀察股</h2>

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
            <option value="4">★★★★ 重要觀察</option>
            <option value="3">★★★ 一般觀察</option>
            <option value="2">★★ 低優先</option>
            <option value="1">★ 暫時觀察</option>
          </select>
        </div>

        <button onClick={addWatch} style={buttonStyle}>
          ➕ 加入觀察池
        </button>
      </section>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>我的觀察清單</h2>

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
                  <th style={th}>Priority</th>
                  <th style={th}>通知</th>
                  <th style={th}>狀態</th>
                  <th style={th}>操作</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td style={td}>{row.symbol}</td>
                    <td style={td}>{row.name}</td>
                    <td style={td}>{row.sector || "-"}</td>
                    <td style={td}>
                      <span style={tagStyle}>{row.group_name || "-"}</span>
                    </td>
                    <td style={td}>
                      <StarRating value={row.priority} />
                    </td>
                    <td style={td}>{row.notify ? "✅" : "—"}</td>
                    <td style={td}>{row.enabled ? "啟用" : "停用"}</td>
                    <td style={td}>
                      <button
                        onClick={() => removeWatch(row)}
                        style={dangerButtonStyle}
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
  fontSize: "88%",
};

const titleStyle: React.CSSProperties = {
  marginTop: 0,
  fontSize: 30,
};

const subStyle: React.CSSProperties = {
  color: "#aaa",
  marginBottom: 22,
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #333",
  borderRadius: 14,
  background: "#0b0b0b",
  padding: 18,
  marginBottom: 20,
};

const formGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 10,
  marginBottom: 14,
};

const inputStyle: React.CSSProperties = {
  padding: 10,
  color: "#fff",
  background: "#111827",
  border: "1px solid #555",
  borderRadius: 8,
};

const buttonStyle: React.CSSProperties = {
  padding: "9px 14px",
  background: "#2563eb",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
};

const dangerButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "#7f1d1d",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const th: React.CSSProperties = {
  border: "1px solid #333",
  padding: 10,
  background: "#1b1b1b",
  color: "#fff",
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  border: "1px solid #333",
  padding: 10,
  whiteSpace: "nowrap",
};

const tagStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "3px 8px",
  borderRadius: 999,
  background: "rgba(250,204,21,0.12)",
  color: "#facc15",
  border: "1px solid rgba(250,204,21,0.25)",
};