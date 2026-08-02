import Link from "next/link";

export default function ModuleMigrationNotice({ title, detail }: { title: string; detail: string }) {
  return (
    <main style={{ minHeight: "100vh", background: "#020617", color: "#e5eefc", padding: 32 }}>
      <section style={{ maxWidth: 1080, margin: "40px auto", background: "#0f172a", border: "1px solid #1e293b", borderRadius: 16, padding: 28 }}>
        <div style={{ color: "#22d3ee", fontWeight: 800 }}>twstock M7.4.1.1 · Turso-only Foundation</div>
        <h1 style={{ marginBottom: 12 }}>{title}</h1>
        <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>{detail}</p>
        <div style={{ marginTop: 20, padding: 16, borderRadius: 12, background: "#082f49", border: "1px solid #0e7490" }}>
          這個舊模組已停止呼叫 Supabase。現階段請從 Turso Dashboard、Top 30、持股觀察與 AI 驗證中心操作；後續版本會逐一以 Turso Repository 重建此功能。
        </div>
        <nav style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 22 }}>
          <Link href="/daily-lab" style={button}>Turso Dashboard</Link>
          <Link href="/portfolio" style={button}>持股觀察</Link>
          <Link href="/daily-validation" style={button}>AI 驗證中心</Link>
          <Link href="/database-maintenance" style={button}>資料庫健康中心</Link>
        </nav>
      </section>
    </main>
  );
}

const button: React.CSSProperties = { padding: "10px 14px", borderRadius: 9, background: "#0e7490", color: "white", textDecoration: "none", fontWeight: 800 };
