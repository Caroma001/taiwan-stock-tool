"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchJson, formatApiError } from "@/lib/client/fetch-json";
import { normalizeUnifiedUpdateStatus, type UnifiedUpdateStatus } from "@/lib/client/normalize-update-status";
import {
  UPDATE_STATUS_EVENT,
  UPDATE_STATUS_REFRESH_EVENT,
  broadcastUpdateStatus,
  claimUpdateStatusLeader,
  createUpdateStatusTabId,
  readLastGoodUpdateStatus,
  releaseUpdateStatusLeader,
  renewUpdateStatusLeader,
  saveLastGoodUpdateStatus,
} from "@/lib/client/update-status-channel";

type UpdateStatus = UnifiedUpdateStatus;

type DiagnosticDetails = {
  ok?: boolean;
  error?: string;
  jobId?: string | null;
  status?: string;
  currentSymbol?: string | null;
  startedAt?: string | null;
  updatedAt?: string | null;
  completedAt?: string | null;
  lastActivityAt?: string | null;
  counts?: {
    total?: number;
    completed?: number;
    skipped?: number;
    trueFailed?: number;
    retrying?: number;
    coolingDown?: number;
    pending?: number;
    nextRetryAt?: string | null;
  };
  categories?: Array<{
    category: string;
    label: string;
    count: number;
    expectedSkip?: boolean;
  }>;
  recentFailures?: Array<{
    symbol: string;
    status: string;
    attempts: number;
    category: string;
    categoryLabel: string;
    expectedSkip?: boolean;
    error: string;
    nextAttemptAt?: string | null;
    updatedAt: string;
  }>;
};

const AUTO_RESUME_STATUS = new Set(["waiting", "running", "checkpointed", "paused"]);
const DURABLE_BOOTSTRAP_RETRY_GUARD_MS = 60_000;
const STATUS_POLL_MS = 12_000;
const DISPLAY_ACTIVE_STATUS = new Set(["waiting", "running", "checkpointed", "paused", "postprocessing"]);

function formatTime(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
}

export default function GlobalUpdateProgress() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [visibleAfterComplete, setVisibleAfterComplete] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [details, setDetails] = useState<DiagnosticDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [retryingFailed, setRetryingFailed] = useState(false);
  const resumeRequestedRef = useRef(false);
  const lastAutoKickAtRef = useRef(0);
  const tabIdRef = useRef<string>("");

  const loadStatus = useCallback(async () => {
    let payload: UpdateStatus;
    try {
      const rawResponse = await fetchJson<UpdateStatus>("/api/development/update/status", {
        cache: "no-store",
      });
      const raw = normalizeUnifiedUpdateStatus(rawResponse);
      const cached = readLastGoodUpdateStatus<UpdateStatus>();
      const isDegraded = Boolean(raw.degraded) || String(raw.status ?? "") === "unavailable";
      payload = isDegraded && cached
        ? {
            ...cached,
            ok: true,
            degraded: true,
            statusSource: raw.statusSource ?? "browser_last_known_good",
            error: raw.error ?? "Turso status temporarily unavailable",
            auxiliaryWarnings: [
              ...(cached.auxiliaryWarnings ?? []),
              "Turso 狀態查詢暫時失敗；目前顯示最近一次成功讀取的進度。",
            ],
          }
        : raw;

      if (!payload.degraded && (payload.id || payload.jobId || Number(payload.total_symbols ?? 0) > 0)) {
        saveLastGoodUpdateStatus(payload);
      }
    } catch (error) {
      const cached = readLastGoodUpdateStatus<UpdateStatus>();
      if (!cached) {
        console.warn("[GlobalUpdateProgress] status unavailable", formatApiError(error));
        return;
      }
      payload = {
        ...cached,
        ok: true,
        degraded: true,
        statusSource: "browser_last_known_good",
        error: formatApiError(error),
        auxiliaryWarnings: [
          ...(cached.auxiliaryWarnings ?? []),
          "狀態 API 暫時無法讀取；目前顯示最近一次成功讀取的進度。",
        ],
      };
    }

    setStatus(payload);
    broadcastUpdateStatus(payload);

    const jobStatus = String(payload.status ?? "");
    const remaining = Number(payload.remaining ?? 0);
    const workerRunning = Boolean(payload.worker?.running);
    const jobId = String(payload.id ?? payload.jobId ?? "").trim();
    const now = Date.now();
    const sinceLastKick = now - lastAutoKickAtRef.current;

    // M8.10.21: browser no longer guesses "stalled" from unchanged progress.
    // It only performs a one-time legacy/bootstrap recovery when the server-side
    // Queue heartbeat explicitly says the durable chain is absent/stale.
    const shouldBootstrapDurableQueue =
      payload.ok &&
      !payload.degraded &&
      Boolean(jobId) &&
      remaining > 0 &&
      AUTO_RESUME_STATUS.has(jobStatus) &&
      !workerRunning &&
      Boolean(payload.queueHeartbeat?.needsBootstrap) &&
      sinceLastKick >= DURABLE_BOOTSTRAP_RETRY_GUARD_MS &&
      !resumeRequestedRef.current;

    if (shouldBootstrapDurableQueue) {
      resumeRequestedRef.current = true;
      lastAutoKickAtRef.current = now;
      try {
        await fetchJson("/api/development/update/resume", { method: "POST" });
      } catch (error) {
        console.warn("[GlobalUpdateProgress] durable queue bootstrap unavailable", formatApiError(error));
      } finally {
        resumeRequestedRef.current = false;
      }
    }
  }, []);

  const loadDetails = useCallback(async () => {
    const jobId = String(status?.id ?? status?.jobId ?? "").trim();
    if (!jobId) return;
    setDetailsLoading(true);
    setDetailsError("");
    try {
      const payload = await fetchJson<DiagnosticDetails>(`/api/development/update/details?jobId=${encodeURIComponent(jobId)}&limit=30&_=${Date.now()}`, {
        cache: "no-store",
      });
      setDetails(payload);
    } catch (error) {
      setDetailsError(formatApiError(error));
    } finally {
      setDetailsLoading(false);
    }
  }, [status?.id, status?.jobId]);

  useEffect(() => {
    const tabId = createUpdateStatusTabId();
    tabIdRef.current = tabId;

    const acceptSharedStatus = (event: Event) => {
      const eventPayload = (event as CustomEvent<UpdateStatus>).detail;
      if (!eventPayload) return;
      const payload = normalizeUnifiedUpdateStatus(eventPayload);
      setStatus(payload);
      if (!payload.degraded && (payload.id || payload.jobId || Number(payload.total_symbols ?? 0) > 0)) {
        saveLastGoodUpdateStatus(payload);
      }
    };

    const pollIfLeader = async (forceClaim = false) => {
      if (document.visibilityState !== "visible") return;
      const leader = forceClaim
        ? claimUpdateStatusLeader(tabId)
        : renewUpdateStatusLeader(tabId);
      if (leader) await loadStatus();
    };

    const cached = readLastGoodUpdateStatus<UpdateStatus>();
    if (cached) setStatus(cached);
    void pollIfLeader(true);

    const timer = window.setInterval(() => void pollIfLeader(false), STATUS_POLL_MS);
    const refreshNow = () => void pollIfLeader(true);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void pollIfLeader(true);
    };

    window.addEventListener(UPDATE_STATUS_EVENT, acceptSharedStatus);
    window.addEventListener(UPDATE_STATUS_REFRESH_EVENT, refreshNow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      releaseUpdateStatusLeader(tabId);
      window.removeEventListener(UPDATE_STATUS_EVENT, acceptSharedStatus);
      window.removeEventListener(UPDATE_STATUS_REFRESH_EVENT, refreshNow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadStatus]);

  useEffect(() => {
    if (!detailsOpen) return;
    void loadDetails();
    const timer = window.setInterval(() => void loadDetails(), 30000);
    return () => window.clearInterval(timer);
  }, [detailsOpen, loadDetails]);

  useEffect(() => {
    if (!detailsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDetailsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailsOpen]);

  useEffect(() => {
    if (status?.status === "completed") {
      setVisibleAfterComplete(true);
      const timer = window.setTimeout(() => setVisibleAfterComplete(false), 15000);
      return () => window.clearTimeout(timer);
    }
    setVisibleAfterComplete(true);
  }, [status?.status]);

  async function retryFailedOnly() {
    const jobId = String(status?.id ?? status?.jobId ?? "").trim();
    if (!jobId || retryingFailed) return;
    setRetryingFailed(true);
    setDetailsError("");
    try {
      const result = await fetchJson<{ ok?: boolean; retried?: number; skipped?: number }>("/api/development/update/retry-failed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      await Promise.all([loadDetails(), loadStatus()]);
      if (Number(result.retried ?? 0) === 0) {
        setDetailsError("目前沒有可重新執行的真正失敗項目。");
      }
    } catch (error) {
      setDetailsError(formatApiError(error));
    } finally {
      setRetryingFailed(false);
    }
  }

  const total = Number(status?.total_symbols ?? 0);
  const processed = Number(status?.processed_symbols ?? 0);
  const success = Number(status?.success_symbols ?? 0);
  const failed = Number(status?.failed_symbols ?? 0);
  const skipped = Number(status?.skipped_symbols ?? 0);
  const percentage = useMemo(() => {
    const direct = Number(status?.percentage);
    const calculated = total > 0 ? (processed / total) * 100 : 0;
    const value = Number.isFinite(direct) ? direct : calculated;
    return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
  }, [processed, status?.percentage, total]);

  const jobStatus = String(status?.status ?? "not_started");
  const hasJob = Boolean(status?.id || status?.jobId);
  const isActive = hasJob && DISPLAY_ACTIVE_STATUS.has(jobStatus) && Number(status?.remaining ?? 0) > 0;
  const isCompleted = hasJob && jobStatus === "completed";

  if (!status?.ok || !hasJob || (!isActive && !isCompleted) || (isCompleted && !visibleAfterComplete)) {
    return null;
  }

  const label = isCompleted
    ? "今日更新完成"
    : jobStatus === "postprocessing"
      ? "Swing10 後處理中"
      : status?.worker?.running
        ? "每日更新執行中"
        : "每日更新自動續傳中";

  const diagnosticCounts = details?.counts;

  return (
    <>
      <div style={shell} className="twst-update-progress" role="status" aria-live="polite">
        <div style={row}>
          <div style={titleBlock}>
            <strong style={title}>{label}</strong>
            <span style={meta}>
              {isCompleted
                ? `成功 ${success}｜略過 ${skipped}｜失敗 ${failed}｜Winner25 ${status.postprocess?.breakout_scored ?? 0}｜法人潛伏 ${status.postprocess?.stealth_scored ?? 0}`
                : jobStatus === "postprocessing"
                  ? `${status.postprocess?.stage ?? status.current_symbol ?? "後處理"}｜Winner25 ${status.postprocess?.breakout_scored ?? 0}/${status.postprocess?.candidate_count ?? 40}｜法人潛伏 ${status.postprocess?.stealth_scored ?? 0}/${status.postprocess?.candidate_count ?? 40}`
                  : detailsOpen && diagnosticCounts
                    ? `目前 ${status.current_symbol ?? "準備下一批"}｜${processed}/${total}｜成功 ${diagnosticCounts.completed ?? success}｜略過 ${diagnosticCounts.skipped ?? 0}｜真正失敗 ${diagnosticCounts.trueFailed ?? failed}`
                    : `目前 ${status.current_symbol ?? "準備下一批"}｜${processed}/${total}｜成功 ${success}｜略過 ${skipped}｜失敗 ${failed}`}
            </span>
          </div>

          <div style={progressWrap} aria-label={`更新進度 ${percentage.toFixed(1)}%`}>
            <div style={{ ...progressBar, width: `${percentage}%` }} />
          </div>

          <strong style={percent}>{percentage.toFixed(1)}%</strong>

          <button type="button" style={detailButton} onClick={() => setDetailsOpen(true)}>
            查看詳情
          </button>
        </div>

        {status.worker?.lastError && <div style={error}>Worker：{status.worker.lastError}</div>}
        {status.last_error && <div style={error}>任務：{status.last_error}</div>}
      </div>

      {detailsOpen && (
        <div style={overlay} role="dialog" aria-modal="true" aria-label="每日更新詳細資訊" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailsOpen(false); }}>
          <section style={modal}>
            <header style={modalHeader}>
              <div>
                <div style={modalEyebrow}>M8.10.12 · AUTO CONTINUE DIAGNOSTICS</div>
                <h2 style={{ margin: "5px 0 0" }}>每日更新詳細資訊</h2>
              </div>
              <button type="button" style={closeButton} onClick={() => setDetailsOpen(false)} aria-label="關閉">×</button>
            </header>

            {detailsError && <div style={modalError}>{detailsError}</div>}
            {detailsLoading && !details && <div style={modalNotice}>正在讀取 Turso 更新明細…</div>}

            {details && (
              <>
                <div style={diagCards}>
                  <DiagCard label="成功" value={details.counts?.completed ?? 0} tone="good" />
                  <DiagCard label="略過／不適用" value={details.counts?.skipped ?? 0} tone="neutral" />
                  <DiagCard label="真正失敗" value={details.counts?.trueFailed ?? 0} tone="bad" />
                  <DiagCard label="重試中" value={details.counts?.retrying ?? 0} tone="warn" />
                  <DiagCard label="額度冷卻" value={details.counts?.coolingDown ?? 0} tone="warn" />
                  <DiagCard label="待處理" value={details.counts?.pending ?? 0} tone="neutral" />
                  <DiagCard label="總數" value={details.counts?.total ?? total} tone="neutral" />
                </div>

                <div style={infoGrid}>
                  <Info label="任務狀態" value={details.status ?? jobStatus} />
                  <Info label="目前股票" value={details.currentSymbol ?? status.current_symbol ?? "—"} />
                  <Info label="最後活動" value={formatTime(details.lastActivityAt ?? details.updatedAt)} />
                  <Info label="Worker" value={status.worker?.running ? "執行中" : "未執行"} />
                </div>

                <div style={sectionTitleRow}>
                  <h3 style={{ margin: 0 }}>錯誤類型統計</h3>
                  <button type="button" style={refreshButton} onClick={() => void loadDetails()} disabled={detailsLoading}>{detailsLoading ? "更新中…" : "重新整理"}</button>
                </div>
                <div style={categoryGrid}>
                  {(details.categories ?? []).length === 0 && <div style={emptyState}>目前沒有錯誤紀錄。</div>}
                  {(details.categories ?? []).map((item) => (
                    <div key={item.category} style={categoryCard}>
                      <strong>{item.label}</strong>
                      <span style={{ fontSize: 22, fontWeight: 900 }}>{item.count}</span>
                      <span style={smallMuted}>{item.expectedSkip ? "系統視為略過／不適用" : "需要觀察或重試"}</span>
                    </div>
                  ))}
                </div>

                <div style={sectionTitleRow}>
                  <div>
                    <h3 style={{ margin: 0 }}>最近失敗紀錄</h3>
                    <div style={smallMuted}>顯示最近 30 筆；真正失敗可單獨重新執行，略過項目不會重試。</div>
                  </div>
                  <button
                    type="button"
                    style={{ ...retryButton, opacity: retryingFailed || Number(details.counts?.trueFailed ?? 0) === 0 ? 0.55 : 1 }}
                    disabled={retryingFailed || Number(details.counts?.trueFailed ?? 0) === 0}
                    onClick={() => void retryFailedOnly()}
                  >
                    {retryingFailed ? "正在重新排隊…" : "只重新執行失敗項目"}
                  </button>
                </div>

                <div style={tableWrap}>
                  <table style={table}>
                    <thead>
                      <tr>
                        <th style={th}>股票</th>
                        <th style={th}>分類</th>
                        <th style={th}>嘗試</th>
                        <th style={th}>狀態</th>
                        <th style={th}>時間</th>
                        <th style={th}>原因</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(details.recentFailures ?? []).map((item, index) => (
                        <tr key={`${item.symbol}-${item.updatedAt}-${index}`}>
                          <td style={td}><strong style={{ color: "#67e8f9" }}>{item.symbol}</strong></td>
                          <td style={td}>{item.categoryLabel}</td>
                          <td style={td}>{item.attempts}</td>
                          <td style={td}>{item.expectedSkip ? "略過" : item.nextAttemptAt && Date.parse(item.nextAttemptAt) > Date.now() ? "額度／網路冷卻" : item.status === "failed" && item.attempts < 4 ? "重試中" : "失敗"}</td>
                          <td style={td}>{formatTime(item.updatedAt)}</td>
                          <td style={{ ...td, minWidth: 320, whiteSpace: "normal", color: "#fecaca" }}>{item.error}</td>
                        </tr>
                      ))}
                      {(details.recentFailures ?? []).length === 0 && <tr><td style={td} colSpan={6}>目前沒有失敗紀錄。</td></tr>}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function DiagCard({ label, value, tone }: { label: string; value: number; tone: "good" | "bad" | "warn" | "neutral" }) {
  const toneColor = tone === "good" ? "#34d399" : tone === "bad" ? "#fb7185" : tone === "warn" ? "#fbbf24" : "#cbd5e1";
  return <div style={diagCard}><span style={smallMuted}>{label}</span><strong style={{ fontSize: 26, color: toneColor }}>{Number(value).toLocaleString("zh-TW")}</strong></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div style={infoCard}><span style={smallMuted}>{label}</span><strong>{value}</strong></div>;
}

const shell: React.CSSProperties = { position:"sticky",top:0,zIndex:2000,background:"linear-gradient(90deg,#0f172a,#083344,#0f172a)",borderBottom:"1px solid #0e7490",color:"#e2e8f0",padding:"8px 18px",boxShadow:"0 10px 30px rgba(0,0,0,0.22)" };
const row: React.CSSProperties = { maxWidth:1560,margin:"0 auto",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap" };
const titleBlock: React.CSSProperties = { display:"flex",alignItems:"baseline",gap:10,minWidth:280,flexWrap:"wrap" };
const title: React.CSSProperties = { color:"#67e8f9",fontSize:13 };
const meta: React.CSSProperties = { color:"#cbd5e1",fontSize:12 };
const progressWrap: React.CSSProperties = { flex:1,minWidth:180,height:8,borderRadius:999,background:"rgba(15,23,42,0.8)",overflow:"hidden",border:"1px solid rgba(103,232,249,0.26)" };
const progressBar: React.CSSProperties = { height:"100%",borderRadius:999,background:"linear-gradient(90deg,#22d3ee,#2563eb,#a855f7)",transition:"width 0.35s ease" };
const percent: React.CSSProperties = { minWidth:60,textAlign:"right",color:"#fff" };
const detailButton: React.CSSProperties = { border:0,borderRadius:999,padding:"6px 11px",background:"rgba(37,99,235,0.32)",color:"#bfdbfe",fontSize:12,fontWeight:900,cursor:"pointer" };
const error: React.CSSProperties = { maxWidth:1560,margin:"4px auto 0",color:"#fecaca",fontSize:12 };
const overlay: React.CSSProperties = { position:"fixed",inset:0,zIndex:20000,background:"rgba(2,6,23,0.78)",backdropFilter:"blur(5px)",display:"grid",placeItems:"center",padding:20 };
const modal: React.CSSProperties = { width:"min(1180px,96vw)",maxHeight:"88vh",overflow:"auto",border:"1px solid #155e75",borderRadius:18,background:"#020617",boxShadow:"0 30px 100px rgba(0,0,0,0.65)",color:"#e2e8f0",padding:20 };
const modalHeader: React.CSSProperties = { display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16,position:"sticky",top:-20,background:"#020617",padding:"4px 0 14px",zIndex:2,borderBottom:"1px solid #1e293b" };
const modalEyebrow: React.CSSProperties = { color:"#22d3ee",fontSize:12,fontWeight:900,letterSpacing:1 };
const closeButton: React.CSSProperties = { width:38,height:38,borderRadius:10,border:"1px solid #334155",background:"#0f172a",color:"#fff",fontSize:24,cursor:"pointer" };
const modalError: React.CSSProperties = { marginTop:14,padding:12,borderRadius:10,border:"1px solid #9f1239",background:"#4c0519",color:"#fecdd3" };
const modalNotice: React.CSSProperties = { marginTop:14,padding:12,borderRadius:10,border:"1px solid #155e75",background:"#083344",color:"#cffafe" };
const diagCards: React.CSSProperties = { display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10,marginTop:18 };
const diagCard: React.CSSProperties = { padding:14,borderRadius:12,border:"1px solid #1e293b",background:"#0f172a",display:"grid",gap:5 };
const infoGrid: React.CSSProperties = { display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10,marginTop:12 };
const infoCard: React.CSSProperties = { padding:12,borderRadius:10,border:"1px solid #1e293b",background:"#07101f",display:"grid",gap:5 };
const sectionTitleRow: React.CSSProperties = { display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap",marginTop:22,marginBottom:10 };
const categoryGrid: React.CSSProperties = { display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:10 };
const categoryCard: React.CSSProperties = { padding:13,border:"1px solid #334155",borderRadius:11,background:"#0f172a",display:"grid",gap:4 };
const refreshButton: React.CSSProperties = { border:"1px solid #475569",borderRadius:9,background:"#1e293b",color:"#e2e8f0",padding:"8px 11px",cursor:"pointer",fontWeight:800 };
const retryButton: React.CSSProperties = { border:0,borderRadius:9,background:"#be123c",color:"white",padding:"9px 13px",cursor:"pointer",fontWeight:900 };
const tableWrap: React.CSSProperties = { overflowX:"auto",border:"1px solid #1e293b",borderRadius:12 };
const table: React.CSSProperties = { width:"100%",borderCollapse:"collapse",fontSize:12 };
const th: React.CSSProperties = { textAlign:"left",padding:"10px 11px",borderBottom:"1px solid #334155",color:"#94a3b8",whiteSpace:"nowrap",background:"#0f172a" };
const td: React.CSSProperties = { padding:"10px 11px",borderBottom:"1px solid #1e293b",verticalAlign:"top",whiteSpace:"nowrap" };
const smallMuted: React.CSSProperties = { color:"#94a3b8",fontSize:12 };
const emptyState: React.CSSProperties = { padding:14,color:"#94a3b8",border:"1px dashed #334155",borderRadius:10 };
