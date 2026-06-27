"use client";

import type { PortfolioRow } from "@/app/types/stock";

type Props = {
  rows: PortfolioRow[];
  onDelete?: (row: PortfolioRow) => void;
  onDownloadHistory?: (row: PortfolioRow) => void;
};

function getSignal(row: PortfolioRow) {
  if (row.close == null || row.profitPercent == null) {
    return { label: "資料不足", color: "#999", summary: "尚未更新股價或缺少歷史資料" };
  }

  if (row.profitPercent <= -10) {
    return { label: "賣出", color: "#00ff88", summary: "跌幅超過 10%，建議優先檢查停損" };
  }

  if (row.profitPercent >= 15) {
    return { label: "持有", color: "#ff5555", summary: "已有明顯獲利，可觀察是否跌破短均線" };
  }

  if (row.profitPercent >= 3) {
    return { label: "買入", color: "#ff5555", summary: "目前略有獲利，若趨勢續強可續抱" };
  }

  return { label: "持有", color: "#facc15", summary: "尚未出現明確買賣訊號" };
}

export default function PortfolioTable({
  rows,
  onDelete,
  onDownloadHistory,
}: Props) {
  return (
    <div style={{ overflowX: "auto", marginTop: 20 }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={th}>股票</th>
            <th style={th}>名稱</th>
            <th style={th}>市場</th>
            <th style={th}>買進價</th>
            <th style={th}>張數</th>
            <th style={th}>最新價</th>
            <th style={th}>損益</th>
            <th style={th}>報酬率</th>
            <th style={th}>摘要</th>
            <th style={th}>操作</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => {
            const signal = getSignal(row);

            return (
              <tr key={row.id}>
                <td style={td}>{row.symbol}</td>
                <td style={td}>{row.name}</td>
                <td style={td}>{row.market}</td>
                <td style={td}>{row.buy_price.toFixed(2)}</td>
                <td style={td}>{row.shares}</td>
                <td style={td}>{row.close == null ? "尚未更新" : row.close.toFixed(2)}</td>

                <td style={{ ...td, color: row.profit == null ? "#999" : row.profit >= 0 ? "#ff5555" : "#00ff88" }}>
                  {row.profit == null ? "-" : row.profit.toLocaleString()}
                </td>

                <td style={{ ...td, color: row.profitPercent == null ? "#999" : row.profitPercent >= 0 ? "#ff5555" : "#00ff88" }}>
                  {row.profitPercent == null ? "-" : `${row.profitPercent.toFixed(2)} %`}
                </td>

                <td style={td}>
                  <div style={{ color: signal.color, fontWeight: 700 }}>{signal.label}</div>
                  <div style={{ color: "#aaa", fontSize: 13 }}>{signal.summary}</div>
                </td>

                <td style={td}>
                  <button style={buttonStyle} onClick={() => (window.location.href = `/analysis?symbol=${row.symbol}`)}>
                    詳細分析
                  </button>

                  <button style={grayButtonStyle} onClick={() => onDownloadHistory?.(row)}>
                    下載2年
                  </button>

                  <button style={dangerButtonStyle} onClick={() => onDelete?.(row)}>
                    刪除
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  background: "#111",
  color: "#fff",
};

const th: React.CSSProperties = {
  border: "1px solid #333",
  padding: 12,
  background: "#1b1b1b",
  fontWeight: 700,
};

const td: React.CSSProperties = {
  border: "1px solid #333",
  padding: 10,
  verticalAlign: "middle",
};

const buttonStyle: React.CSSProperties = {
  padding: "8px 12px",
  marginRight: 6,
  marginBottom: 6,
  background: "#2563eb",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
};

const grayButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "#374151",
};

const dangerButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "#7f1d1d",
};