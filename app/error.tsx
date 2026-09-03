"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[AppErrorBoundary]", error);
  }, [error]);

  return (
    <main style={{ minHeight: "60vh", padding: 32, background: "#020617", color: "#e2e8f0" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: 24, border: "1px solid #7f1d1d", borderRadius: 16, background: "#1f0710" }}>
        <h1 style={{ marginTop: 0 }}>頁面暫時無法載入</h1>
        <p style={{ color: "#fecaca" }}>{error.message || "未知錯誤"}</p>
        <p style={{ color: "#94a3b8" }}>M8.10.2 已保留錯誤資訊。請先重新載入；若仍發生，再查看 Terminal 的第一個 Server Error。</p>
        <button onClick={reset} style={{ border: 0, borderRadius: 10, padding: "10px 16px", background: "#0891b2", color: "white", fontWeight: 800, cursor: "pointer" }}>
          重新載入
        </button>
      </div>
    </main>
  );
}
