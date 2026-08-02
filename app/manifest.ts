import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bruce 台股決策中心",
    short_name: "Bruce 股票",
    description: "台股市場環境、Top 30、持股與驗證中心",
    start_url: "/daily-lab",
    display: "standalone",
    background_color: "#020617",
    theme_color: "#2563eb",
    orientation: "portrait-primary",
    lang: "zh-TW",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
