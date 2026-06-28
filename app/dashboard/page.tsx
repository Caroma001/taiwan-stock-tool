"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type AiScoreRow = {
  symbol: string;
  name: string;
  close: number | null;
  score: number;
  signal: string;
  foreignBuy20: number;
  foreignDays: number;
  priceChange10: number | null;
  efficiency: number;
  summary: string;
};

type DashboardData = {
  success: boolean;
  updatedAt: string | null;
  portfolio: {
    totalCost: number;
    totalValue: number;
    totalProfit: number;
    totalReturn: number;
  };
  ai: {
    buy: number;
    hold: number;
    sell: number;
    topPicks: AiScoreRow[];
    allScores: AiScoreRow[];
  };
  watchlist: {
    total: number;
  };
  system: {
    database: string;
    aiEngine: string;
    cloud: string;
  };
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState("");
  const [message, setMessage] = useState("");

  async function loadDashboard() {
    setLoading(true);

    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      const json = await res.json();
      setData(json);
    } catch (error) {
      setMessage(`Dashboard 讀取失敗：${String(error)}`);
    }

    setLoading(false);
  }

  async function runAction(label: string, url: string) {
    setRunning(label);
    setMessage(`${label} 執行中...`);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const json = await res.json();
      console.log(`${label} response:`, json);

      if (!res.ok || !json.success) {
        const firstError =
          json.error ||
          json.message ||
          json.results?.find((x: any) => !x.success)?.error ||
          "未知錯誤";

        setMessage(
          `${label} 失敗：${firstError}；成功 ${
            json.successCount ?? 0
          } / 總數 ${json.total ?? "-"}`
        );

        throw new Error(firstError);
      }

      setMessage(
        `${label} 完成：成功 ${
          json.successCount ?? json.total ?? "-"
        } / 總數 ${json.total ?? "-"}`
      );

      await loadDashboard();
      return json;
    } catch (error) {
      setMessage(`${label} 失敗：${String(error)}`);
      throw error;
    } finally {
      setRunning("");
    }
  }

  async function runAll() {
    setRunning("一鍵更新全部");
    setMessage("一鍵更新全部執行中...");

    try {
      await runAction("更新 Watchlist 股價", "/api/watchlist-prices");
      await runAction("更新外資資料", "/api/foreign-trading");
      await runAction("執行 AIS 吸籌分析", "/api/accumulation-engine");

      setMessage("一鍵更新全部完成");
      await loadDashboard();
    } catch (error) {
      setMessage("一鍵更新全部失敗：" + String(error));
    } finally {
      setRunning("");
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  return (
    <main style={pageStyle}>
      <h1 style={titleStyle}>📈 Bruce&apos;s TW Stock AI V5</h1>
      <p style={subStyle}>只分析 Watchlist 與持股，不掃全市場。</p>

      <section style={cardStyle}>
        <h2 style={h2Style}>⚡ 控制中心</h2>

        <button onClick={runAll} disabled={!!running} style={buttonStyle}>
          🔄 一鍵更新全部
        </button>

        <button
          onClick={() => runAction("更新 Watchlist 股價", "/api/watchlist-prices")}
          disabled={!!running}
          style={buttonStyle}
        >
          📈 更新 Watchlist 股價
        </button>

        <button
          onClick={() => runAction("更新外資資料", "/api/foreign-trading")}
          disabled={!!running}
          style={buttonStyle}
        >
          🏦 更新外資資料
        </button>

        <button
          onClick={() =>
            runAction("執行 AIS 吸籌分析", "/api/accumulation-engine")
          }
          disabled={!!running}
          style={purpleButtonStyle}
        >
          🤖 執行 AIS 吸籌分析
        </button>

        <button onClick={loadDashboard} disabled={loading} style={grayButtonStyle}>
          📥 重新整理
        </button>

        {running && <div style={runningStyle}>目前執行：{running}</div>}
        {message && <div style={messageStyle}>{message}</div>}
      </section>

      <section style={gridStyle}>
        <SummaryCard
          title="Watchlist"
          value={`${data?.watchlist?.total ?? 0} 檔`}
          color="#facc15"
        />

        <SummaryCard
          title="投入成本"
          value={`${(data?.portfolio?.totalCost ?? 0).toLocaleString()} 元`}
          color="#ffffff"
        />

        <SummaryCard
          title="目前市值"
          value={`${(data?.portfolio?.totalValue ?? 0).toLocaleString()} 元`}
          color="#ffffff"
        />

        <SummaryCard
          title="總損益"
          value={`${(data?.portfolio?.totalProfit ?? 0).toLocaleString()} 元`}
          color={(data?.portfolio?.totalProfit ?? 0) >= 0 ? "#ff5555" : "#00ff88"}
        />

        <SummaryCard
          title="總報酬率"
          value={`${data?.portfolio?.totalReturn ?? 0}%`}
          color={(data?.portfolio?.totalReturn ?? 0) >= 0 ? "#ff5555" : "#00ff88"}
        />

        <SummaryCard
          title="資料更新日"
          value={data?.updatedAt || "尚未更新"}
          color="#38bdf8"
        />
      </section>

      <section style={cardStyle}>
        <h2 style={h2Style}>⭐ AIS 股票分析結果</h2>

        {data?.ai?.allScores?.length ? (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={th}>排名</th>
                  <th style={th}>股票</th>
                  <th style={th}>名稱</th>
                  <th style={th}>收盤</th>
                  <th style={th}>AIS</th>
                  <th style={th}>訊號</th>
                  <th style={th}>外資20日</th>
                  <th style={th}>買超天數</th>
                  <th style={th}>10日漲跌</th>
                  <th style={th}>吸籌效率</th>
                  <th style={th}>AI摘要</th>
                </tr>
              </thead>

              <tbody>
                {data.ai.allScores.map((row, index) => (
                  <tr key={row.symbol}>
                    <td style={td}>{index + 1}</td>
                    <td style={td}>{row.symbol}</td>
                    <td style={td}>{row.name}</td>
                    <td style={td}>{row.close ?? "-"}</td>
                    <td style={{ ...td, color: "#facc15", fontWeight: 900 }}>
                      {row.score}
                    </td>
                    <td style={td}>{row.signal}</td>
                    <td style={td}>{Number(row.foreignBuy20).toLocaleString()}</td>
                    <td style={td}>{row.foreignDays}</td>
                    <td style={td}>
                      {row.priceChange10 === null
                        ? "-"
                        : `${Number(row.priceChange10).toFixed(2)}%`}
                    </td>
                    <td style={td}>{row.efficiency}</td>
                    <td style={summaryTd}>{row.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: "#aaa" }}>
            目前尚無 AIS 分析資料。請依序按「更新 Watchlist 股價」→「更新外資資料」→「執行 AIS 吸籌分析」。
          </p>
        )}
      </section>

      <section style={cardStyle}>
        <h2 style={h2Style}>🚪 快速入口</h2>

        <div style={menuGridStyle}>
          <MenuButton href="/watchlist" title="⭐ Watchlist" subtitle="觀察池管理" />
          <MenuButton href="/portfolio" title="💼 Portfolio" subtitle="持股管理" />
          <MenuButton href="/analysis" title="📉 Analysis" subtitle="個股分析" />
          <MenuButton href="/ai-scanner" title="🤖 AI Scanner" subtitle="AI 選股" />
        </div>
      </section>
    </main>
  );
}

function SummaryCard({
  title,
  value,
  color,
}: {
  title: string;
  value: string;
  color: string;
}) {
  return (
    <div style={summaryCardStyle}>
      <div style={{ color: "#aaa", marginBottom: 8 }}>{title}</div>
      <div style={{ color, fontSize: 22, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function MenuButton({
  href,
  title,
  subtitle,
}: {
  href: string;
  title: string;
  subtitle: string;
}) {
  return (
    <Link href={href} style={menuStyle}>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{title}</div>
      <div style={{ color: "#aaa", marginTop: 8 }}>{subtitle}</div>
    </Link>
  );
}

const pageStyle: React.CSSProperties = {
  background: "#050505",
  color: "#fff",
  minHeight: "100vh",
  padding: 28,
  paddingBottom: 80,
};

const titleStyle: React.CSSProperties = {
  marginTop: 0,
  fontSize: 30,
  fontWeight: 900,
};

const subStyle: React.CSSProperties = {
  color: "#aaa",
  marginBottom: 22,
};

const h2Style: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 16,
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #333",
  borderRadius: 14,
  background: "#0b0b0b",
  padding: 18,
  marginBottom: 20,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 14,
  marginBottom: 20,
};

const summaryCardStyle: React.CSSProperties = {
  border: "1px solid #333",
  borderRadius: 14,
  background: "#101010",
  padding: 18,
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 14px",
  marginRight: 10,
  marginBottom: 10,
  background: "#2563eb",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
};

const purpleButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "#7c3aed",
};

const grayButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "#374151",
};

const runningStyle: React.CSSProperties = {
  marginTop: 10,
  color: "#38bdf8",
};

const messageStyle: React.CSSProperties = {
  marginTop: 10,
  color: "#facc15",
  lineHeight: 1.6,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
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

const summaryTd: React.CSSProperties = {
  ...td,
  whiteSpace: "normal",
  minWidth: 360,
  lineHeight: 1.5,
  color: "#ddd",
};

const menuGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 14,
};

const menuStyle: React.CSSProperties = {
  display: "block",
  background: "#111",
  border: "1px solid #333",
  borderRadius: 14,
  padding: 18,
  color: "#fff",
  textDecoration: "none",
};