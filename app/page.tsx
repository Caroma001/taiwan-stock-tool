import Link from "next/link";

export default function Home() {
  return (
    <main style={pageStyle}>
      <h1>📈 Bruce 台股投資管理系統</h1>
      <p style={{ color: "#aaa" }}>Dashboard / Portfolio / Analysis / AI Scanner</p>

      <div style={gridStyle}>
        <Link href="/dashboard" style={cardStyle}>📊 Dashboard<br />投資總覽</Link>
        <Link href="/portfolio" style={cardStyle}>💼 Portfolio<br />持股管理</Link>
        <Link href="/analysis" style={cardStyle}>📉 Analysis<br />個股分析</Link>
        <Link href="/ai-scanner" style={cardStyle}>🤖 AI Scanner<br />AI 選股</Link>
      </div>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  background: "#050505",
  color: "#fff",
  minHeight: "100vh",
  padding: "40px",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "20px",
  marginTop: "30px",
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #333",
  borderRadius: "16px",
  padding: "28px",
  background: "#111",
  color: "#fff",
  textDecoration: "none",
  fontSize: "20px",
  lineHeight: "1.8",
};