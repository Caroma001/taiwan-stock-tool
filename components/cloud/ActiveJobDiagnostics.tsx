"use client";

import { useCallback, useEffect, useState } from "react";

type Diagnostics = {
  ok?: boolean;
  version?: string;
  error?: string;
  health?: string;
  repaired?: boolean;
  repairActions?: string[];
  activeJobId?: string | null;
  jobDate?: string | null;
  jobStatus?: string | null;
  totalSymbols?: number;
  processedSymbols?: number;
  hasCloudUpdateItems?: boolean;
  pipelineJobId?: string | null;
  queueJobId?: string | null;
  queueMessageId?: string | null;
  queueRuntimeState?: string | null;
  queueGeneration?: number;
  queueContinuationId?: string | null;
  queueConsumedContinuationId?: string | null;
  queueHeartbeatContinuationId?: string | null;
  queueRecoveryCount?: number;
  queueLastRecoveryReason?: string | null;
  queuePublishedAt?: string | null;
  queueConsumedAt?: string | null;
  queueHeartbeatAt?: string | null;
  queuePhase?: string | null;
  queuePublishCount?: number;
  queueConsumeCount?: number;
  queueSafetyPublishedAt?: string | null;
  bulkStartedAt?: string | null;
  pointerJobId?: string | null;
  source?: string;
  allMatch?: boolean;
  updatedAt?: string | null;
  calendarDate?: string | null;
  effectiveTradingDate?: string | null;
  tradingDateSource?: string | null;
  tradingDateReason?: string | null;
  marketClosedToday?: boolean;
  bulkStatus?: string | null;
  bulkPriceSource?: string | null;
  bulkInstitutionalSource?: string | null;
  bulkPriceRows?: number;
  bulkInstitutionalRows?: number;
  bulkAccumulationRows?: number;
  bulkAllowedSymbols?: number;
  bulkExternalRequests?: number;
  bulkFinMindRequests?: number;
  bulkOfficialRequests?: number;
  bulkLastError?: string | null;
  bulkNextRetryAt?: string | null;
};

function healthLabel(value?: string) {
  switch (value) {
    case "HEALTHY": return "🟢 HEALTHY";
    case "POINTER_REPAIRED": return "🟡 POINTER REPAIRED";
    case "COUNTS_REPAIRED": return "🟡 COUNTS REPAIRED";
    case "NO_ITEMS": return "🟠 JOB HAS NO ITEMS";
    case "INVALID_JOB": return "🔴 JOB ID MISMATCH";
    default: return "⚪ NOT STARTED";
  }
}

export default function ActiveJobDiagnostics() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/development/update/active-job-diagnostics?_=${Date.now()}`, { cache: "no-store" });
      const payload = await response.json() as Diagnostics;
      setData(payload);
    } catch (error) {
      setData({ ok: false, error: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [open, load]);

  const cells: Array<[string, string | number]> = [
    ["日曆日期", data?.calendarDate ?? "—"],
    ["有效交易日", data?.effectiveTradingDate ?? "—"],
    ["交易日來源", data?.tradingDateSource ?? "—"],
    ["Active Job ID", data?.activeJobId ?? "—"],
    ["Job Date", data?.jobDate ?? "—"],
    ["Job Status", data?.jobStatus ?? "—"],
    ["cloud_update_jobs.total_symbols", data?.totalSymbols ?? 0],
    ["cloud_update_jobs.processed_symbols", data?.processedSymbols ?? 0],
    ["是否有 cloud_update_items", data?.hasCloudUpdateItems ? "YES" : "NO"],
    ["pipeline_state.job_id", data?.pipelineJobId ?? "—"],
    ["Queue jobId", data?.queueJobId ?? "—"],
    ["Queue Runtime", data?.queueRuntimeState ?? "—"],
    ["Queue Generation", data?.queueGeneration ?? 1],
    ["Queue Recovery Count", data?.queueRecoveryCount ?? 0],
    ["Consumed Continuation", data?.queueConsumedContinuationId ?? "—"],
    ["Heartbeat Continuation", data?.queueHeartbeatContinuationId ?? "—"],
    ["Last Recovery Reason", data?.queueLastRecoveryReason ?? "—"],
    ["Queue Published", data?.queuePublishedAt ?? "—"],
    ["Queue Consumed", data?.queueConsumedAt ?? "—"],
    ["Queue Heartbeat", data?.queueHeartbeatAt ?? "—"],
    ["Queue Phase", data?.queuePhase ?? "—"],
    ["Queue Publish / Consume", `${data?.queuePublishCount ?? 0} / ${data?.queueConsumeCount ?? 0}`],
    ["Safety-net", data?.queueSafetyPublishedAt ? "ARMED" : "—"],
    ["Bulk Started", data?.bulkStartedAt ?? "—"],
    ["Pointer jobId", data?.pointerJobId ?? "—"],
    ["Resolver source", data?.source ?? "—"],
    ["Bulk Snapshot", data?.bulkStatus ?? "—"],
    ["Bulk Price Source", data?.bulkPriceSource ?? "—"],
    ["Bulk Institutional Source", data?.bulkInstitutionalSource ?? "—"],
    ["Bulk Price Rows", data?.bulkPriceRows ?? 0],
    ["Bulk Institutional Rows", data?.bulkInstitutionalRows ?? 0],
    ["Bulk Accumulation Scores", data?.bulkAccumulationRows ?? 0],
    ["Bulk External Requests", data?.bulkExternalRequests ?? 0],
    ["Bulk Official Requests", data?.bulkOfficialRequests ?? 0],
    ["Bulk FinMind Requests", data?.bulkFinMindRequests ?? 0],
    ["Bulk Next Retry", data?.bulkNextRetryAt ?? "—"],
  ];

  return <section style={box}>
    <button type="button" style={toggle} onClick={() => setOpen((value) => !value)}>
      <span><strong>Active Job Diagnostics</strong> <span style={muted}>· M8.10.22 Durable Queue Recovery v2</span></span>
      <span>{data ? healthLabel(data.health) : "診斷"} {open ? "▲" : "▼"}</span>
    </button>
    {open && <div style={{padding:"0 14px 14px"}}>
      <div style={toolbar}>
        <span style={muted}>只有展開時每 15 秒讀取診斷資料，避免增加 Turso Rows Read。</span>
        <button type="button" style={refresh} disabled={loading} onClick={() => void load()}>{loading ? "讀取中…" : "立即重讀"}</button>
      </div>
      {!data?.ok && data?.error && <div style={errorBox}>{data.error}</div>}
      {data?.ok && <>
        {data.tradingDateReason && <div style={{...truth,borderColor:"#0e7490",background:"#083344",marginTop:0,marginBottom:10}}>
          <strong>{data.marketClosedToday ? "休市日模式" : "有效交易日判定"}</strong>
          <div style={{marginTop:5,fontSize:13}}>{data.tradingDateReason}</div>
        </div>}
        <div style={grid}>{cells.map(([label,value]) => <div key={label} style={cell}><small style={muted}>{label}</small><div style={mono}>{String(value)}</div></div>)}</div>
        <div style={{...truth,borderColor:data.allMatch?"#166534":"#b45309",background:data.allMatch?"#052e16":"#451a03"}}>
          <strong>{data.allMatch ? "✅ SOURCE OF TRUTH MATCH" : "❌ SOURCE OF TRUTH MISMATCH"}</strong>
          <div style={{...mono,fontSize:12,marginTop:8,lineHeight:1.65}}>
            active pointer&nbsp;: {data.pointerJobId ?? "—"}<br/>
            pipeline state&nbsp;: {data.pipelineJobId ?? "—"}<br/>
            queue jobId&nbsp;&nbsp;&nbsp;: {data.queueJobId ?? "—"}<br/>
            resolved job&nbsp;&nbsp;: {data.activeJobId ?? "—"}
          </div>
        </div>
        {data.bulkLastError && <div style={{...repairBox,borderColor:"#a16207",background:"#422006"}}><strong>Bulk Snapshot Note</strong><div style={{...mono,fontSize:12,marginTop:5}}>{data.bulkLastError}</div></div>}
        {!!data.repairActions?.length && <div style={repairBox}><strong>Auto Repair</strong>{data.repairActions.map((action) => <div key={action} style={{...mono,fontSize:12,marginTop:5}}>{action}</div>)}</div>}
      </>}
    </div>}
  </section>;
}

const box:React.CSSProperties={maxWidth:1400,margin:"16px auto",border:"1px solid #334155",borderRadius:14,background:"#0f172a",overflow:"hidden",color:"#e2e8f0"};
const toggle:React.CSSProperties={width:"100%",display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",padding:"13px 14px",border:0,background:"transparent",color:"inherit",cursor:"pointer",textAlign:"left"};
const toolbar:React.CSSProperties={display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:10};
const refresh:React.CSSProperties={border:"1px solid #475569",background:"#1e293b",color:"#e2e8f0",borderRadius:9,padding:"7px 10px",fontWeight:800,cursor:"pointer"};
const grid:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:9};
const cell:React.CSSProperties={padding:10,border:"1px solid #1e293b",borderRadius:10,background:"#020617"};
const mono:React.CSSProperties={fontFamily:"ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace",wordBreak:"break-all",fontWeight:800,marginTop:4};
const muted:React.CSSProperties={color:"#94a3b8"};
const truth:React.CSSProperties={marginTop:10,padding:12,border:"1px solid",borderRadius:10};
const repairBox:React.CSSProperties={marginTop:10,padding:12,border:"1px solid #1d4ed8",borderRadius:10,background:"#172554"};
const errorBox:React.CSSProperties={padding:12,border:"1px solid #be123c",borderRadius:10,background:"#4c0519",color:"#fecdd3"};
