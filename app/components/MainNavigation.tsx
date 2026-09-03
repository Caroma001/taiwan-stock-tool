"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import QuickStockSearch from "./QuickStockSearch";
import DisplayPreferences from "./ui/DisplayPreferences";
import { PROJECT_RELEASE } from "@/lib/version/project-version";

const items = [
  { href: "/daily-lab", label: "綜合日報", icon: "報" },
  { href: "/development-center", label: "每日一鍵更新", icon: "↻" },
  { href: "/swing10", label: "Swing10", icon: "10" },
  { href: "/bruce-score", label: "Bruce Score", icon: "B" },
  { href: "/portfolio-manager", label: "投資組合", icon: "◎" },
  { href: "/strategy-guide", label: "選股策略", icon: "策" },
  { href: "/trade-history", label: "歷史交易", icon: "↺" },
  { href: "/stock-analysis", label: "個股分析", icon: "✦" },
] as const;

export default function MainNavigation() {
  const pathname = usePathname();

  return (
    <header style={shell} className="twst-main-navigation">
      <div style={bar}>
        <Link href="/daily-lab" style={brand} aria-label="回到綜合日報">
          <span style={brandMark} className="twst-brand-mark" aria-hidden="true">◆◆◆</span>
          <span style={brandText} className="twst-brand-text">Bruce's 台股決策中心&nbsp;&nbsp;{PROJECT_RELEASE}</span>
        </Link>

        <div style={tools} className="twst-tools">
          <QuickStockSearch />
          <DisplayPreferences />
        </div>
        <nav style={nav} aria-label="主要導覽">
          {items.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/daily-lab" && pathname.startsWith(`${item.href}/`));

            return (
              <Link
                key={item.href}
                href={item.href}
                className="twst-nav-link"
                style={{
                  ...link,
                  ...(active ? activeLink : {}),
                  ...(item.href === "/daily-lab" && pathname !== "/daily-lab"
                    ? homeLink
                    : {}),
                }}
              >
                <span style={icon} className="twst-nav-icon">{item.icon}</span>
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

const tools: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginLeft: "auto",
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
