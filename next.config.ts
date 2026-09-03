import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/full-market-scanner", destination: "/smart-selection", permanent: true },
      { source: "/foreign-radar", destination: "/smart-selection", permanent: true },
      { source: "/ai-engine", destination: "/smart-selection", permanent: true },
      { source: "/ai-scanner", destination: "/smart-selection", permanent: true },
      { source: "/analysis", destination: "/stock-analysis", permanent: true },
      { source: "/decision-engine", destination: "/smart-selection", permanent: true },
      { source: "/portfolio", destination: "/portfolio-manager", permanent: true },
      { source: "/watchlist", destination: "/portfolio-manager", permanent: true },
      { source: "/cloud", destination: "/development-center", permanent: true },
      { source: "/cloud-deployment", destination: "/development-center", permanent: true },
      { source: "/dashboard", destination: "/daily-lab", permanent: true },
      { source: "/data-quality", destination: "/database-maintenance", permanent: true },
      { source: "/indicators", destination: "/stock-analysis", permanent: true },
      { source: "/offline", destination: "/daily-lab", permanent: false },
    ];
  },
};

export default nextConfig;
