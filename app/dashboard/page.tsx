export default function DashboardPage() {
    return (
      <main style={pageStyle}>
        <h1>📊 Dashboard 投資總覽</h1>
        <p>這裡會放：總資產、總損益、今日損益、更新狀態。</p>
      </main>
    );
  }
  
  const pageStyle: React.CSSProperties = {
    background: "#050505",
    color: "#fff",
    minHeight: "100vh",
    padding: "40px",
  };