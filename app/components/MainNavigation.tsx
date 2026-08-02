"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/daily-lab", label: "主頁", icon: "⌂" },
  { href: "/portfolio", label: "持股觀察", icon: "◎" },
  { href: "/portfolio-ai-validation", label: "兩週 AI 驗證", icon: "AI" },
  { href: "/trade-history", label: "歷史交易", icon: "↺" },
  { href: "/daily-validation", label: "AI 驗證中心", icon: "◆" },
  { href: "/full-market-scanner", label: "Top 30", icon: "30" },
  { href: "/decision-engine", label: "AI 決策", icon: "★" },
  { href: "/learning-center", label: "AI 學習", icon: "↗" },
  { href: "/ai-engine", label: "AI 分析", icon: "✦" },
  { href: "/indicators", label: "技術指標", icon: "∿" },
  { href: "/sync", label: "資料同步", icon: "⇄" },
  { href: "/database-maintenance", label: "資料庫維護", icon: "▣" },
  { href: "/cloud", label: "雲端更新", icon: "☁" },
  { href: "/cloud-deployment", label: "雲端部署", icon: "↗" },
] as const;

export default function MainNavigation() {
  const pathname = usePathname();

  return (
    <header style={shell}>
      <div style={bar}>
        <Link href="/daily-lab" style={brand} aria-label="回到主頁">
          <span style={brandMark}>Bruce</span>
          <span style={brandText}>Bruce's 台股決策中心</span>
        </Link>

        <nav style={nav} aria-label="主要導覽">
          {items.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/daily-lab" && pathname.startsWith(`${item.href}/`));

            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  ...link,
                  ...(active ? activeLink : {}),
                  ...(item.href === "/daily-lab" && pathname !== "/daily-lab"
                    ? homeLink
                    : {}),
                }}
              >
                <span style={icon}>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

const shell: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 1000,
  width: "100%",
  borderBottom: "1px solid #1e293b",
  background: "rgba(2, 6, 23, 0.96)",
  backdropFilter: "blur(12px)",
};

const bar: React.CSSProperties = {
  maxWidth: 1560,
  margin: "0 auto",
  padding: "10px 20px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  flexWrap: "wrap",
};

const brand: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 9,
  color: "#e2e8f0",
  textDecoration: "none",
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const brandMark: React.CSSProperties = {
  padding: "5px 8px",
  borderRadius: 7,
  background: "linear-gradient(135deg, #0891b2, #2563eb)",
  color: "#fff",
  fontSize: 12,
  letterSpacing: 0.8,
};

const brandText: React.CSSProperties = {
  fontSize: 15,
};

const nav: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
};

const link: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "8px 10px",
  border: "1px solid transparent",
  borderRadius: 8,
  color: "#94a3b8",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const activeLink: React.CSSProperties = {
  borderColor: "#0e7490",
  background: "#083344",
  color: "#67e8f9",
};

const homeLink: React.CSSProperties = {
  borderColor: "#2563eb",
  background: "#1d4ed8",
  color: "#fff",
};

const icon: React.CSSProperties = {
  minWidth: 16,
  textAlign: "center",
  fontSize: 12,
};
