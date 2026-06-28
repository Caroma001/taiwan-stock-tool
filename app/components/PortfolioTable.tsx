"use client";

import type { PortfolioRow } from "@/app/types/stock";

type Props = {
  rows: PortfolioRow[];
  onDelete?: (row: PortfolioRow) => void;
  onDownloadHistory?: (row: PortfolioRow) => void;
};

function getSignal(row: PortfolioRow) {
  if (row.close == null || row.profitPercent == null) {
    return {
      label: "資料不足",
      color: "#999",
      summary: "尚未更新股價或缺少歷史資料",
    };
  }

  if (row.profitPercent <= -10) {
    return {
      label: "賣出",
      color: "#00ff88",
      summary: "跌幅超過 10%，建議優先檢查停損",
    };
  }

  if (row.profitPercent >= 20) {
    return {
      label: "停利提醒",
      color: "#ff5555",
      summary: "獲利已超過 20%，可考慮分批停利",
    };
  }

  if (row.profitPercent >= 15) {
    return {
      label: "持有",
      color: "#ff5555",
      summary: "已有明顯獲利，可觀察是否跌破短均線",
    };
  }

  return {
    label: "持有",
    color: "#facc15",
    summary: "尚未出現明確買賣訊號",
  };
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
            <th style={th}>現有價值</th>
            <th style={th}>損益</th>
            <th style={th}>報酬率</th>
            <th style={th}>歷史資料</th>
            <th style={th}>摘要</th>
            <th style={th}>操作</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => {
            const signal = getSignal(row);
            const currentValue =
              row.close == null ? null : row.close * row.shares * 1000;

            return (
              <tr key={row.id}>
                <td style={td}>
                  <a
                    href={`/analysis?symbol=${row.symbol}`}
                    style={symbolLinkStyle}
                  >
                    {row.symbol}
                  </a>
                </td>

                <td style={td}>{row.name}</td>
                <td style={td}>{row.market}</td>

                <td style={numberTd}>
                  {row.buy_price.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>

                <td style={numberTd}>{row.shares}</td>

                <td
                  style={{
                    ...numberTd,
                    color:
                      row.close == null
                        ? "#999"
                        : row.close >= row.buy_price
                        ? "#ff5555"
                        : "#00ff88",
                  }}
                >
                  {row.close == null
                    ? "尚未更新"
                    : row.close.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                </td>

                <td style={numberTd}>
                  {currentValue == null
                    ? "-"
                    : `${Math.round(currentValue).toLocaleString()} 元`}
                </td>

                <td
                  style={{
                    ...numberTd,
                    color:
                      row.profit == null
                        ? "#999"
                        : row.profit >= 0
                        ? "#ff5555"
                        : "#00ff88",
                  }}
                >
                  {row.profit == null
                    ? "-"
                    : `${row.profit.toLocaleString()} 元`}
                </td>

                <td
                  style={{
                    ...numberTd,
                    color:
                      row.profitPercent == null
                        ? "#999"
                        : row.profitPercent >= 0
                        ? "#ff5555"
                        : "#00ff88",
                  }}
                >
                  {row.profitPercent == null
                    ? "-"
                    : `${row.profitPercent.toFixed(2)} %`}
                </td>

                <td style={td}>
                  {row.hasTwoYearHistory ? (
                    <span style={{ color: "#00ff88", fontWeight: 700 }}>
                      ✅ 已有2年資料
                    </span>
                  ) : (
                    <span style={{ color: "#facc15" }}>
                      近30日資料 ({row.historyCount}筆)
                    </span>
                  )}
                </td>

                <td style={td}>
                  <div style={{ color: signal.color, fontWeight: 700 }}>
                    {signal.label}
                  </div>
                  <div style={{ color: "#aaa", fontSize: 13 }}>
                    {signal.summary}
                  </div>
                </td>

                <td style={td}>
                  <button
                    type="button"
                    style={buttonStyle}
                    onClick={() =>
                      (window.location.href = `/analysis?symbol=${row.symbol}`)
                    }
                  >
                    詳細分析
                  </button>

                  <button
                    type="button"
                    style={grayButtonStyle}
                    onClick={() => onDownloadHistory?.(row)}
                  >
                    更新資料
                  </button>

                  <button
                    type="button"
                    style={dangerButtonStyle}
                    onClick={() => onDelete?.(row)}
                  >
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
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  border: "1px solid #333",
  padding: 10,
  verticalAlign: "middle",
  whiteSpace: "nowrap",
};

const numberTd: React.CSSProperties = {
  ...td,
  textAlign: "right",
};

const symbolLinkStyle: React.CSSProperties = {
  color: "#38bdf8",
  fontWeight: 800,
  textDecoration: "none",
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