"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PROJECT_RELEASE } from "@/lib/version/project-version";
import { fetchJson } from "@/lib/client/fetch-json";
import { normalizeUnifiedUpdateStatus, type UnifiedUpdateStatus } from "@/lib/client/normalize-update-status";
import ActiveJobDiagnostics from "@/components/cloud/ActiveJobDiagnostics";
import DataQualityPanel from "@/components/m8121/DataQualityPanel";
import { requestUpdateStatusRefresh } from "@/lib/client/update-status-channel";

type Postprocess = {
  status?: string;
  stage?: string;
  candidate_count?: number;
  chip_success?: number;
  chip_failed?: number;
  breakout_scored?: number;
  stealth_scored?: number;
  radar_failed?: number;
  last_error?: string | null;
  completed_at?: string | null;
} | null;

type UpdateStatus = UnifiedUpdateStatus;

export default function DevelopmentCenterPage() {
  const [status, setStatus] = useState<UpdateStatus>({});
  const [message, setMessage] = useState("M8.10.22：Durable Queue Recovery v2 已啟用。Published 不再等於 Alive；只有 successor Consume / Heartbeat / 成功接棒才算健康。");
  const [submitting, setSubmitting] = useState(false);
  const durableBootstrapAttemptedRef = useRef(false);

  const loadStatus = useCallback(async () => {
    try {
      const payload = await fetchJson<UpdateStatus>(`/api/development/update/status?_=${Date.now()}`, { cache: "no-store" });
      setStatus(normalizeUnifiedUpdateStatus(payload));
    } catch (error) {
      setStatus((current) => ({
        ...current,
        degraded: true,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }, []);

  useEffect(() => {
    // M8.10.22 deliberately favors one tiny, reliable status read every 15s
    // over the previous cache/leader/BroadcastChannel chain. The API itself
    // reads one active-pointer JOIN and never scans cloud_update_items.
    void loadStatus();
    const timer = window.setInterval(() => void loadStatus(), 15_000);
    return () => window.clearInterval(timer);
  }, [loadStatus]);


  useEffect(() => {
    const heartbeat = status.queueHeartbeat;
    const jobId = String(status.jobId ?? status.id ?? "").trim();
    const remaining = Number(status.remaining ?? 0);
    if (
      durableBootstrapAttemptedRef.current ||
      !jobId ||
      remaining <= 0 ||
      status.degraded ||
      !heartbeat?.needsBootstrap
    ) return;

    durableBootstrapAttemptedRef.current = true;
    void (async () => {
      try {
        const response = await fetch("/api/development/update/resume", { method: "POST" });
        const payload = await response.json();
        if (!payload?.ok) throw new Error(payload?.error || "Durable Queue bootstrap failed");
        if (payload?.resumed) {
          setMessage("M8.10.22 已將舊的未完成 Job 正式交給 Durable Vercel Queue；後續不需要瀏覽器維持續傳。");
        }
        window.setTimeout(() => void loadStatus(), 1800);
      } catch (error) {
        durableBootstrapAttemptedRef.current = false;
        setMessage(error instanceof Error ? error.message : String(error));
      }
    })();
  }, [
    status.id,
    status.jobId,
    status.remaining,
    status.degraded,
    status.queueHeartbeat?.needsBootstrap,
    loadStatus,
  ]);

  const percentage = useMemo(() => {
    const direct = Number(status.percentage);
    const total = Number(status.total_symbols ?? 0);
    const processed = Number(status.processed_symbols ?? 0);
    const value = Number.isFinite(direct) ? direct : total > 0 ? (processed / total) * 100 : 0;
    return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
  }, [status]);

  async function start(reset = false) {
    setSubmitting(true);
    setMessage(reset ? "正在重建有效交易日完整更新任務……" : "正在啟動每日完整更新……");
    try {
      const response = await fetch("/api/development/update/start", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reset }),
      });
      const payload = await response.json();
      if (!payload.ok) throw new Error(payload.error || "無法啟動更新任務");
      setMessage(payload.message || "更新已交由後端執行；可切換頁面，進度會持續保存在 Turso。完成後會自動刷新 Swing10。 ");
      requestUpdateStatusRefresh();
      await loadStatus();
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setSubmitting(false); }
  }

  async function resume() {
    setSubmitting(true);
    try {
      const response = await fetch("/api/development/update/resume", { method: "POST" });
      const payload = await response.json();
      if (!payload.ok) throw new Error(payload.error || "無法續傳更新任務");
      setMessage(payload.resumed ? "已續傳未完成任務。" : "目前沒有需要續傳的市場資料任務。 ");
      requestUpdateStatusRefresh();
      await loadStatus();
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setSubmitting(false); }
  }

  async function pause() {
    setSubmitting(true);
    try {
      const response = await fetch("/api/development/update/pause", { method: "POST" });
      const payload = await response.json();
      if (!payload.ok) throw new Error(payload.error || "無法暫停更新任務");
      setMessage("已暫停市場資料 Worker；已完成項目會保留，下次可以續傳。 ");
      requestUpdateStatusRefresh();
      await loadStatus();
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setSubmitting(false); }
  }

  const post = status.postprocess;
  const postReady = Boolean(post && post.status !== "waiting");
  const workerRunning = Boolean(status.worker?.running);
  const isPostprocessing = String(status.status ?? "") === "postprocessing" || post?.status === "running";
  const remaining = Number(status.remaining ?? 0);
  const activeJob = Boolean(status.id || status.jobId) && String(status.status ?? "") !== "completed" && remaining > 0;
  const mainDisabled = submitting || workerRunning || isPostprocessing || activeJob;
  const queueHeartbeat = status.queueHeartbeat;
  const mainLabel = isPostprocessing
    ? "Swing10 後處理中…"
    : workerRunning
      ? "市場資料更新中…"
      : activeJob
        ? queueHeartbeat?.consumerAlive
          ? "Queue Consumer 執行中…"
          : queueHeartbeat?.waitingForConsumer
            ? "等待 Queue 啟動…"
            : queueHeartbeat?.needsBootstrap
              ? "Queue 停滯，Durable Recovery 中…"
              : String(queueHeartbeat?.displayState ?? "等待 Queue…")
        : "每日一鍵更新全部";

  return <main style={page}>
    <section style={hero}>
      <div>
        <div style={eyebrow}>TWSTOCK {PROJECT_RELEASE} · UNIFIED DAILY UPDATE</div>
        <h1 style={{margin:"8px 0"}}>每日一鍵更新</h1>
        <p style={muted}>這是全站唯一的日常更新入口。一次完成市場資料 → 法人籌碼 → Winner25/法人潛伏底層評分 → Risk Intelligence → Swing10。測試與實際部位只更新績效與退出提醒。</p>
      </div>
      <div style={actions}>
        <button style={primary} disabled={mainDisabled} onClick={()=>void start(false)}>{mainLabel}</button>
        <a style={secondary} href="/daily-lab">查看綜合日報</a>
        <a style={secondary} href="/swing10">查看 Swing10</a>
        <a style={secondary} href="/portfolio-manager">查看投資組合</a>
      </div>
    </section>

    <section style={notice}>
      <div>{message}</div>
      <div style={{marginTop:6,fontSize:12,color:"#a5f3fc"}}>
        UI Source：{status.statusSource ?? "等待 unified status"} · Job：{status.jobId ?? status.id ?? "—"} ·
        {` ${status.processed_symbols ?? 0}/${status.total_symbols ?? 0}`}
      </div>
      <div style={{marginTop:4,fontSize:12,color:"#bfdbfe"}}>
        Bulk Engine：{status.bulkSnapshot?.status ?? "準備中"} · 價格 {status.bulkSnapshot?.priceRows ?? 0} ·
        法人 {status.bulkSnapshot?.institutionalRows ?? 0} · 外資分數 {status.bulkSnapshot?.accumulationRows ?? 0} · 外部請求 {status.bulkSnapshot?.externalRequests ?? 0}
        {status.bulkSnapshot?.finmindRequests ? `（FinMind ${status.bulkSnapshot.finmindRequests}）` : "（官方資料源）"}
      </div>
      <div style={{marginTop:4,fontSize:12,color:"#fde68a"}}>
        Queue：{status.queueHeartbeat?.displayState ?? "尚未建立"} ·
        Generation {status.queueHeartbeat?.generation ?? 1} ·
        Recovery {status.queueHeartbeat?.recoveryCount ?? 0} ·
        Publish {status.queueHeartbeat?.publishCount ?? 0} · Consume {status.queueHeartbeat?.consumeCount ?? 0} ·
        Heartbeat {status.queueHeartbeat?.heartbeatAgeSeconds == null ? "—" : `${status.queueHeartbeat.heartbeatAgeSeconds}s ago`} ·
        Phase {status.queueHeartbeat?.phase ?? "—"}
      </div>
    </section>

    <DataQualityPanel />

    <ActiveJobDiagnostics />

    <section style={pipeline}>
      {[
        ["1","全市場資料", `${status.processed_symbols??0}/${status.total_symbols??0}`],
        ["2","法人籌碼", postReady ? `${post?.chip_success??0} 成功 / ${post?.chip_failed??0} 失敗` : "等待市場資料完成"],
        ["3","Winner25 即時分", postReady ? `${post?.breakout_scored??0}/${post?.candidate_count??40}` : "等待"],
        ["4","法人潛伏", postReady ? `${post?.stealth_scored??0}/${post?.candidate_count??40}` : "等待"],
        ["5","測試 Cohort", "只更新績效，不每日換股"],
      ].map(([no,label,value])=><div key={String(no)} style={pipeCard}><span style={pipeNo}>{no}</span><div><strong>{label}</strong><div style={muted}>{value}</div></div></div>)}
    </section>

    <section style={cards}>
      <Card label="Queue 狀態" value={String(status.queueHeartbeat?.displayState ?? "尚未建立")} />
      <Card label="Generation" value={String(status.queueHeartbeat?.generation ?? 1)} />
      <Card label="Recovery Count" value={String(status.queueHeartbeat?.recoveryCount ?? 0)} />
      <Card label="Current Published" value={status.queueHeartbeat?.publishedAt ? new Date(status.queueHeartbeat.publishedAt).toLocaleTimeString("zh-TW",{hour12:false}) : "—"} />
      <Card label="Current Consumed" value={status.queueHeartbeat?.consumedAt ? new Date(status.queueHeartbeat.consumedAt).toLocaleTimeString("zh-TW",{hour12:false}) : "—"} />
      <Card label="Consumer Heartbeat" value={status.queueHeartbeat?.heartbeatAgeSeconds == null ? "—" : `${status.queueHeartbeat.heartbeatAgeSeconds}s ago`} />
      <Card label="Safety-net" value={status.queueHeartbeat?.safetyPhase ?? (status.queueHeartbeat?.safetyPublishedAt ? "ARMED" : "—")} />
      <Card label="Last Recovery" value={status.queueHeartbeat?.lastRecoveryReason ?? "—"} />
    </section>

    <section style={cards}>
      <Card label="Bulk 資料引擎" value={String(status.bulkSnapshot?.status ?? "準備中")} />
      <Card label="外部資料請求" value={`${status.bulkSnapshot?.externalRequests ?? 0} 次`} />
      <Card label="價格快照" value={`${status.bulkSnapshot?.priceRows ?? 0} rows`} />
      <Card label="法人快照" value={`${status.bulkSnapshot?.institutionalRows ?? 0} rows`} />
      <Card label="外資吸籌分數" value={`${status.bulkSnapshot?.accumulationRows ?? 0} 檔`} />
    </section>

    <section style={cards}>
      <Card label="任務狀態" value={post?.status==="running" ? String(post.stage??"後處理") : String(status.status??"尚未開始")} />
      <Card label="市場進度" value={`${Number.isFinite(percentage)?percentage.toFixed(1):"0.0"}%`} />
      <Card label="市場成功／略過／失敗" value={`${status.success_symbols??0} / ${status.skipped_symbols??0} / ${status.failed_symbols??0}`} />
      <Card label="Winner25" value={`${post?.breakout_scored??0}/${post?.candidate_count??40}`} />
      <Card label="法人潛伏" value={`${post?.stealth_scored??0}/${post?.candidate_count??40}`} />
      <Card label="後處理狀態" value={post?.stage??"尚未執行"} />
    </section>

    {status.degraded && <section style={{...panel,borderColor:"#a16207"}}>
      <h2>狀態監控暫時降級</h2>
      <p style={{color:"#fde68a"}}>Turso 狀態查詢暫時不穩；目前保留最近一次成功讀取的進度。自動續傳在狀態恢復前不會亂送 Queue。</p>
      {status.error && <p style={{color:"#fef3c7"}}>診斷：{status.error}</p>}
    </section>}

    {(post?.last_error || status.worker?.lastError || (!status.degraded && status.error)) && <section style={{...panel,borderColor:"#9f1239"}}>
      <h2>更新訊息</h2>
      <p style={{color:"#fecdd3"}}>{post?.last_error || status.worker?.lastError || status.error}</p>
    </section>}

    <section style={panel}>
      <h2>更新原則</h2>
      <ul style={{lineHeight:1.9,color:"#cbd5e1"}}>
        <li>Winner25 兩年歷史模型不會每天重訓；每日只套用已驗證規則到今日候選。</li>
        <li>舊 Top20 Cohort 僅保留作長週期對照；正式 5～10 日操作以 Swing10 測試／實際部位為主。</li>
        <li>Turso 保存進度；Mac 睡眠或網頁切換後可續傳，不需要從 0 開始。</li>
        <li>市場 Universe 先排除 ETF／ETN／權證與明確非普通股商品；這些項目直接列為「略過」，不再消耗 API 重試。</li>
        <li>資料源明確無資料也歸類為「略過／不適用」；429／402 額度限制、網路、Turso 才保留為真正失敗。</li>
        <li>API 額度限制會進入 60 分鐘冷卻，網路／逾時採 5 分鐘冷卻，不會在數秒內連續重試四次。</li>
        <li>「查看詳情」可檢視成功、略過、真正失敗、額度冷卻與最近錯誤，並只重試真正失敗項目。</li>
        <li>M8.10.22 高效率引擎：每個有效交易日先建立一次全市場 Bulk Snapshot，個股分析階段不再逐檔呼叫股價／法人 API。</li>
        <li>M8.10.22 固定 Target Trading Date：價格、法人、指標、Winner25 與潛伏分析全部鎖定同一有效交易日。</li>
        <li>M8.10.22 Development Center 每 15 秒只讀一次 Active Pointer 單列摘要；不再依賴多層 browser leader/cache 才能顯示真實進度。</li>
        <li>M8.10.22 Bulk Snapshot 有單日 lease；多個 Queue continuation 同時抵達也只有一個 owner 能抓外部市場資料。</li>
        <li>M8.10.22 Turso 只保存一次市場快照與分析結果；狀態頁不掃描 cloud_update_items，避免為了顯示進度產生大量 Rows Read。</li>
        <li>M8.10.22 Vercel Queue 自動續傳保留；Bulk Snapshot 完成後，每批直接做本地分析與增量 checkpoint。</li>
        <li>M8.10.22 Worker 每次處理 24～40 檔，且沿用 cloud_update_jobs 增量計數，不再每批 COUNT/SUM 全表。</li>
        <li>M8.10.22 當日市場價格／法人資料已存在時直接重用 Snapshot；同一交易日重按更新不會再重抓上游資料。</li>
        <li>M8.10.22 法人日流量由同一次 Bulk Institutional Snapshot 拆成外資／投信／自營商；Top40 後處理只補候選需要的特殊持股資料。</li>
        <li>M8.10.22 不啟用 GitHub Actions / Vercel Cron；Vercel Queue callback 自己續傳，瀏覽器只在 server heartbeat 明確判定舊任務沒有 Queue 時做一次 bootstrap。</li>
        <li>M8.10.22 Queue callback 進入即寫 consumed / heartbeat；每 5 檔本地分析與 Bulk 重要階段再更新 heartbeat。</li>
        <li>M8.10.22 每個正常 Queue callback 先排一個 360 秒 Safety-net；若主鏈已發布下一棒，Safety-net 自動略過；若主鏈中斷才接手恢復。</li>
        <li>M8.10.22 continuation idempotency 以「目前 continuation → 下一 continuation」建立，不再因 processed 數字沒變而卡死在同一 idempotency key。</li>
</ul>
    </section>

    <details style={advanced}>
      <summary style={{cursor:"pointer",fontWeight:900}}>進階／維護操作</summary>
      <p style={muted}>一般日常不要使用這些按鈕。只有中斷、除錯或資料庫維護時才需要。</p>
      <div style={actions}>
        <button style={secondary} disabled={submitting||workerRunning||isPostprocessing} onClick={()=>void resume()}>續傳未完成任務</button>
        {workerRunning && <button style={danger} disabled={submitting} onClick={()=>void pause()}>暫停 Worker</button>}
        <button style={danger} disabled={mainDisabled} onClick={()=>void start(true)}>重建有效交易日任務</button>
        <a style={secondary} href="/sync">資料同步除錯</a>
        <a style={secondary} href="/database-maintenance">資料庫維護</a>
      </div>
    </details>
  </main>;
}

function Card({label,value}:{label:string;value:string}){return <div style={card}><span style={muted}>{label}</span><strong style={{fontSize:22}}>{value}</strong></div>}
const page:React.CSSProperties={minHeight:"100vh",background:"#020617",color:"#e2e8f0",padding:"28px 18px"};
const hero:React.CSSProperties={maxWidth:1400,margin:"0 auto",display:"flex",justifyContent:"space-between",gap:20,flexWrap:"wrap",padding:24,border:"1px solid #155e75",borderRadius:18,background:"linear-gradient(135deg,#071426,#0f172a)"};
const eyebrow:React.CSSProperties={color:"#22d3ee",fontWeight:900,letterSpacing:1.2,fontSize:12};
const muted:React.CSSProperties={color:"#94a3b8"};
const actions:React.CSSProperties={display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"};
const button:React.CSSProperties={border:0,borderRadius:10,padding:"12px 16px",color:"white",fontWeight:900,cursor:"pointer",textDecoration:"none"};
const primary:React.CSSProperties={...button,background:"#0f766e"};
const secondary:React.CSSProperties={...button,background:"#334155"};
const danger:React.CSSProperties={...button,background:"#be123c"};
const notice:React.CSSProperties={maxWidth:1400,margin:"16px auto",padding:16,borderRadius:12,border:"1px solid #0e7490",background:"#083344",color:"#cffafe"};
const pipeline:React.CSSProperties={maxWidth:1400,margin:"16px auto",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:10};
const pipeCard:React.CSSProperties={display:"flex",gap:10,alignItems:"center",padding:15,border:"1px solid #1e293b",borderRadius:14,background:"#0f172a"};
const pipeNo:React.CSSProperties={display:"grid",placeItems:"center",width:30,height:30,borderRadius:999,background:"#0e7490",fontWeight:900};
const cards:React.CSSProperties={maxWidth:1400,margin:"16px auto",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12};
const card:React.CSSProperties={padding:18,borderRadius:14,border:"1px solid #1e293b",background:"#0f172a",display:"grid",gap:8};
const panel:React.CSSProperties={maxWidth:1400,margin:"16px auto",padding:22,borderRadius:16,border:"1px solid #1e293b",background:"#0f172a"};
const advanced:React.CSSProperties={...panel,color:"#cbd5e1"};
