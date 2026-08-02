"use client";

import { useEffect, useState } from "react";

type DeploymentInfo = {
  ok: boolean;
  version: string;
  environment: string;
  deploymentUrl: string;
  git?: { commitSha?: string | null; branch?: string | null; repository?: string | null };
};

export default function CloudDeploymentPage() {
  const [info, setInfo] = useState<DeploymentInfo | null>(null);
  const [health, setHealth] = useState<string>("檢查中");
  const [ready, setReady] = useState<string>("檢查中");

  useEffect(() => {
    Promise.all([
      fetch("/api/deployment", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/health", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/ready", { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([deployment, healthData, readyData]) => {
        setInfo(deployment);
        setHealth(healthData?.ok ? "正常" : "異常");
        setReady(readyData?.ok ? "正常" : "尚未就緒");
      })
      .catch(() => {
        setHealth("無法連線");
        setReady("無法連線");
      });
  }, []);

  return (
    <main className="mx-auto w-full max-w-5xl p-6 text-slate-100">
      <section className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
        <p className="text-sm text-cyan-400">twstock M7.6.2</p>
        <h1 className="mt-2 text-3xl font-semibold">Cloud Deployment Center</h1>
        <p className="mt-2 text-slate-400">確認目前網站是否已部署至 Vercel Production，並連接 Turso。</p>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        {[['版本', info?.version ?? '讀取中'], ['網站健康', health], ['Turso 就緒', ready]].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
            <p className="text-sm text-slate-400">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </section>

      <section className="mt-6 rounded-2xl border border-slate-700 bg-slate-900 p-6">
        <h2 className="text-xl font-semibold">目前部署資訊</h2>
        <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <div><dt className="text-slate-400">環境</dt><dd>{info?.environment ?? '讀取中'}</dd></div>
          <div><dt className="text-slate-400">網址</dt><dd className="break-all">{info?.deploymentUrl ?? '讀取中'}</dd></div>
          <div><dt className="text-slate-400">Git Branch</dt><dd>{info?.git?.branch ?? '本機或未連接 Git'}</dd></div>
          <div><dt className="text-slate-400">Commit</dt><dd className="break-all">{info?.git?.commitSha?.slice(0, 12) ?? '—'}</dd></div>
        </dl>
      </section>

      <section className="mt-6 rounded-2xl border border-amber-700/60 bg-amber-950/30 p-6">
        <h2 className="text-xl font-semibold">上線判斷</h2>
        <p className="mt-2 text-slate-300">網址仍顯示 localhost 代表目前只在 Mac 執行；顯示 vercel.app 且健康與就緒皆正常，才代表 Mac 關機後仍可使用。</p>
      </section>
    </main>
  );
}
