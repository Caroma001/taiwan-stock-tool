"use client";

import { PROJECT_RELEASE } from "@/lib/version/project-version";
import { fetchJson, formatApiError } from "@/lib/client/fetch-json";
import { useCallback, useEffect, useState } from "react";

type Row = Record<string, any>;
type Report = {
  version: string; reportDate: string; generatedAt: string; summaryText: string;
  market: { verdict: string; posture: string; riskScore: number | null; riskLevel: string; riskReasons: string[]; taiex: { date: string | null; close: number | null; changePct: number | null; return5Pct: number | null; drawdown20Pct: number | null }; global: { date: string | null; marketScore: number | null; regime: string; riskLevel: string; confidence: number | null; reasons: string[] }; international: Array<{ symbol: string; name: string; quoteDate: string; close: number | null; changePct: number | null; ageDays: number | null; stale: boolean; valid: boolean; issue: string | null }>; dataWarning: string | null };
  earlyWatch: { total: number; ewA: number; ewB: number; top5: Row[] };
  swing10: { total: number; a1: number; a0: number; riskChanged: number; top5: Row[]; aRows: Row[] };
  fastTrack: { title: string; note: string; top5: Row[] };
  positions: { open: number; sellCheck: number; watch: number; hold: number; rows: Row[] };
  training: { schemaVersion: string; recordCount: number; eligible: boolean; eligibilityReasons: string[]; labelStatus: "pending" | "partial" | "mature"; availableFutureSessions: number; maturedAt: string | null; records: Row[] };
  conclusion: { headline: string; points: string[] };
  sourceDates: Record<string, string | null>;
};
type ExportStatus = { reportDate: string; jsonDownloadedAt: string | null; jsonDownloadCount: number; jsonDownloadedSignature: string | null; txtDownloadedAt: string | null; txtDownloadCount: number; lastFilename: string | null };
type Schedule = { timezone: string; cutoff: string; calendarDate: string; effectiveTradingDate: string; marketClosedToday: boolean; beforeSafeClose: boolean; state: "waiting_1500" | "market_closed" | "awaiting_pipeline" | "ready" | "historical"; message: string };
type Payload = { ok: boolean; report: Report; history: Array<{ date: string; generatedAt: string; jsonDownloadedAt: string | null; jsonDownloadCount: number }>; exportStatus: ExportStatus; schedule: Schedule; jsonBytes: number; exportSignature: string; error?: string };

const number = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : null;
const fmt = (v: unknown, d = 1) => number(v) == null ? "—" : Number(v).toFixed(d);
const pct = (v: unknown, d = 2) => number(v) == null ? "—" : `${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(d)}%`;
const money = (v: unknown) => number(v) == null ? "—" : Number(v).toLocaleString("zh-TW", { maximumFractionDigits: 2 });
const tone = (v: unknown) => number(v) == null ? "#94a3b8" : Number(v) >= 0 ? "#4ade80" : "#fb7185";
const signed = (v: unknown, d = 1) => number(v) == null ? "—" : `${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(d)}`;
const when = (v: string | null) => v ? new Date(v).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false }) : "—";
const kb = (bytes: number | null | undefined) => bytes == null ? "—" : `${(bytes / 1024).toFixed(1)} KB`;

export default function DailyIntegratedReportPage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async (date?: string) => {
    setLoading(true); setError("");
    try {
      const q = date ? `?date=${encodeURIComponent(date)}&_=${Date.now()}` : `?_=${Date.now()}`;
      const data = await fetchJson<Payload>(`/api/daily-report${q}`, { cache: "no-store" });
      if (!data.ok) throw new Error(data.error || "綜合日報讀取失敗");
      setPayload(data); setSelectedDate(data.report.reportDate);
    } catch (e) { setError(formatApiError(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const rebuild = async () => {
    setLoading(true); setError("");
    try {
      const data = await fetchJson<{ ok: boolean; report: Report; error?: string }>("/api/daily-report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: selectedDate || undefined }), cache: "no-store" });
      if (!data.ok) throw new Error(data.error || "重建綜合日報失敗");
      await load(data.report.reportDate);
    } catch (e) { setError(formatApiError(e)); setLoading(false); }
  };

  const report = payload?.report;
  const markDownloaded = async (kind: "txt" | "json", filename: string) => {
    if (!report) return;
    try {
      const data = await fetchJson<{ ok: boolean; exportStatus: ExportStatus }>("/api/daily-report", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: report.reportDate, format: kind, filename, signature: payload?.exportSignature ?? null }), cache: "no-store" });
      if (data.ok) setPayload(prev => prev ? { ...prev, exportStatus: data.exportStatus } : prev);
    } catch { /* file download must not fail because status marking failed */ }
  };
  const download = async (kind: "txt" | "json") => {
    if (!report) return;
    const filename = kind === "txt" ? `twstock-${report.reportDate}-daily-summary.txt` : `twstock-${report.reportDate}-daily-training.json`;
    const content = kind === "txt" ? report.summaryText : JSON.stringify(report, null, 2);
    const blob = new Blob([content], { type: kind === "txt" ? "text/plain;charset=utf-8" : "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
    await markDownloaded(kind, filename);
  };
  const copySummary = async () => { if (!report) return; await navigator.clipboard.writeText(report.summaryText); setCopied(true); window.setTimeout(() => setCopied(false), 1800); };

  const history = payload?.history ?? [];
  const fast = report?.fastTrack.top5 ?? [];
  const early = report?.earlyWatch.top5 ?? [];
  const relative = report?.swing10.top5 ?? [];
  const exportStatus = payload?.exportStatus;
  const schedule = payload?.schedule;
  const jsonFresh = Boolean(exportStatus?.jsonDownloadedAt && exportStatus.jsonDownloadedSignature && exportStatus.jsonDownloadedSignature === payload?.exportSignature);
  const jsonNeedsRedownload = Boolean(exportStatus?.jsonDownloadedAt && !jsonFresh);

  return <main style={page}><div style={wrap}>
    <header style={head}>
      <div><div style={eye}>TWSTOCK {PROJECT_RELEASE} · DAILY DATASET REPORT</div><h1 style={{ margin: "8px 0" }}>每日綜合分析＋策略訓練資料</h1><p style={muted}>台北時間 15:00 才鎖定當日完整資料。每個交易日保存一份可下載 JSON，整合大盤／國際、Early Watch、Swing10、Fast5、持股與後續 1/3/5/10 日訓練標籤。</p></div>
      <div style={actions}><a style={buttonLink} href="/development-center">每日一鍵更新</a><a style={buttonLink} href="/swing10">Swing10</a><a style={buttonLink} href="/portfolio-manager">投資組合</a></div>
    </header>

    {schedule && <div style={{ ...scheduleBar, borderColor: schedule.state === "ready" ? "#15803d" : schedule.state === "awaiting_pipeline" ? "#d97706" : "#0e7490" }}>
      <strong>{schedule.state === "ready" ? "✅ 正式資料已鎖定" : schedule.state === "awaiting_pipeline" ? "🟡 15:00 更新執行中" : schedule.state === "market_closed" ? "🗓️ 今日休市" : schedule.state === "historical" ? "📚 歷史日報" : "⏳ 等待 15:00"}</strong>
      <span>{schedule.message}</span><span style={muted}>固定排程：交易日 15:00 Asia/Taipei</span>
    </div>}

    <div style={toolbar}>
      <label style={label}>報告日期<select value={selectedDate} onChange={e => { const d = e.target.value; setSelectedDate(d); void load(d); }} style={select}>{history.map(h => <option key={h.date} value={h.date}>{h.jsonDownloadedAt ? "✅" : "⬇"} {h.date}</option>)}</select></label>
      <button onClick={() => void rebuild()} style={primary} disabled={loading}>{loading ? "整理中…" : "重新產生本日報告"}</button>
      <button onClick={() => void download("json")} style={jsonFresh ? downloadedButton : button} disabled={!report}>JSON 訓練檔：{jsonFresh ? "✅ 已下載" : jsonNeedsRedownload ? "🔄 需重下載" : "⬇ 未下載"}</button>
      <button onClick={() => void download("txt")} style={button} disabled={!report}>下載 TXT 摘要</button>
      <button onClick={() => void copySummary()} style={button} disabled={!report}>{copied ? "✅ 已複製" : "複製摘要"}</button>
    </div>

    {report && <div style={exportStrip}>
      <div><strong>JSON 檔案狀態</strong><div>{jsonFresh ? `✅ 已下載 ${when(exportStatus?.jsonDownloadedAt ?? null)}｜共 ${exportStatus?.jsonDownloadCount ?? 0} 次` : jsonNeedsRedownload ? "🔄 報告／標籤已更新，請重新下載 JSON" : "⬇ 尚未下載"}</div></div>
      <div><strong>資料集</strong><div>{report.training.recordCount} records｜{kb(payload?.jsonBytes)}｜schema {report.training.schemaVersion}</div></div>
      <div><strong>訓練資格</strong><div style={{ color: report.training.eligible ? "#4ade80" : "#fbbf24" }}>{report.training.eligible ? "✅ 可納入策略訓練" : "⚠ 暫停使用"}</div></div>
      <div><strong>未來標籤</strong><div>{report.training.labelStatus === "mature" ? "✅ 10日標籤已成熟" : `⏳ ${report.training.availableFutureSessions}/10 交易日`}</div></div>
    </div>}

    {error && <div style={bad}>{error}</div>}
    {!report && loading && <section style={panel}>正在整理每日綜合分析…</section>}
    {report && <>
      <section style={{ ...panel, borderColor: report.market.posture === "high-risk" ? "#be123c" : report.market.posture === "defensive" ? "#d97706" : "#0f766e" }}>
        <div style={sectionHead}><div><small style={muted}>資料日 {report.reportDate}</small><h2 style={{ margin: "6px 0" }}>{report.market.verdict}</h2><div style={{ fontSize: "var(--twst-body-font)", fontWeight: 900 }}>{report.conclusion.headline}</div></div><div style={riskBadge}>大盤風險 {fmt(report.market.riskScore, 0)}/100</div></div>
        <div style={metrics}>
          <Metric label="TAIEX" value={money(report.market.taiex.close)} note={`${pct(report.market.taiex.changePct)}｜5日 ${pct(report.market.taiex.return5Pct)}｜20日回撤 ${pct(report.market.taiex.drawdown20Pct)}`} />
          <Metric label="全球市場" value={report.market.global.regime || "—"} note={`市場分數 ${fmt(report.market.global.marketScore, 0)}｜${report.market.global.riskLevel}風險`} />
          <Metric label="Early Watch" value={`A ${report.earlyWatch.ewA} / B ${report.earlyWatch.ewB}`} note={`候選 ${report.earlyWatch.total} 檔`} />
          <Metric label="Swing10" value={`A1 ${report.swing10.a1} / A0 ${report.swing10.a0}`} note={`相對候選 ${report.swing10.total} 檔`} />
          <Metric label="持股提醒" value={`🔴${report.positions.sellCheck} 🟡${report.positions.watch}`} note={`開放部位 ${report.positions.open}｜續抱 ${report.positions.hold}`} />
        </div>
      </section>

      <section style={panel}><div style={sectionHead}><div><h2 style={{ margin: 0 }}>大盤＋國際風向</h2><p style={muted}>異常行情會直接排除並標示，不再讓 close=0 或極端錯值污染 Risk Intelligence 與訓練樣本。</p></div><strong>{report.market.global.date ?? "—"}</strong></div>
        <div style={quoteGrid}>
          <Mini label="TAIEX 加權指數" value={money(report.market.taiex.close)} change={report.market.taiex.changePct} date={report.market.taiex.date} valid />
          {report.market.international.map(q => <Mini key={q.symbol} label={`${q.name}${q.stale ? " ⚠" : ""}`} value={q.valid ? money(q.close) : "異常排除"} change={q.valid ? q.changePct : null} date={q.quoteDate} valid={q.valid} />)}
        </div>
        <div style={reasonBox}>{[...report.market.riskReasons, ...report.market.global.reasons].slice(0, 8).map((x, i) => <span key={`${x}-${i}`}>• {x}</span>)}{report.market.dataWarning && <strong style={{ color: "#fbbf24" }}>⚠ {report.market.dataWarning}</strong>}</div>
      </section>

      <section style={{ ...panel, borderColor: "#7c3aed" }}><div style={sectionHead}><div><h2 style={{ margin: 0 }}>{report.fastTrack.title}</h2><p style={muted}>{report.fastTrack.note}</p></div><span style={pill}>研究型排序</span></div>
        <DataTable headers={["排名", "股票", "準備度", "階段", "級別", "Swing10", "Decision Δ1", "發動", "外資", "Early", "大盤風險"]} rows={fast.map(r => [r.rank, <Stock key={`${r.symbol}-s`} r={r} />, <b key={`${r.symbol}-q`}>{fmt(r.score, 1)}</b>, r.stage, r.grade, fmt(r.swing10, 1), `${fmt(r.decision, 1)} / ${signed(r.decisionDelta1d, 1)}`, fmt(r.trigger, 0), fmt(r.foreign, 0), r.earlyTier ? `${r.earlyTier} ${fmt(r.earlyScore, 0)}` : "—", fmt(r.marketRisk, 0)])} />
      </section>

      <div style={twoCols}>
        <section style={panel}><div style={sectionHead}><div><h2 style={{ margin: 0 }}>Early Watch Top5</h2><p style={muted}>提早發現基本面／法人先改善、價格尚未完全反映；不是直接買點。</p></div><a style={tinyLink} href="/swing10">完整 Early Watch</a></div>
          <DataTable headers={["排名", "股票", "級別", "Early", "基本面", "法人", "月營收YoY", "20日股價"]} rows={early.map(r => [r.rank, <Stock key={`${r.symbol}-e`} r={r} />, r.tier, fmt(r.score, 0), fmt(r.fundamental, 0), fmt(r.accumulation, 0), pct(r.revenueYoy, 1), pct(r.price20Pct, 1)])} />
        </section>
        <section style={panel}><div style={sectionHead}><div><h2 style={{ margin: 0 }}>Swing10 相對 Top5</h2><p style={muted}>即使 A1/A0 = 0，仍保留市場內相對強者，避免把「不宜追價」誤讀成「沒有股票會漲」。</p></div><a style={tinyLink} href="/swing10">完整 Swing10</a></div>
          <DataTable headers={["排名", "股票", "級別", "Swing10", "Decision", "Δ1", "法人潛伏", "發動", "外資"]} rows={relative.map(r => [r.rank, <Stock key={`${r.symbol}-r`} r={r} />, r.grade, fmt(r.swing10, 1), fmt(r.decision, 1), signed(r.decisionDelta1d, 1), fmt(r.stealth, 1), fmt(r.trigger, 0), fmt(r.foreign, 0)])} />
        </section>
      </div>

      <section style={panel}><div style={sectionHead}><div><h2 style={{ margin: 0 }}>策略訓練資料說明</h2><p style={muted}>每日日報把 Early Watch 30 + Swing10 20 去重成一份 feature snapshot；10 個後續交易日成熟後，補上快速獲利與停損標籤。</p></div></div>
        <div style={metrics}><Metric label="訓練 records" value={String(report.training.recordCount)} note={report.training.eligible ? "資料品質通過" : "本日暫停納入"} /><Metric label="未來交易日" value={`${report.training.availableFutureSessions}/10`} note={`label ${report.training.labelStatus}`} /><Metric label="5日快速目標" value="+5%" note="hit5PctBy5d" /><Metric label="10日快速目標" value="+8%" note="hit8PctBy10d；同步記錄 -4.5% 停損" /></div>
        {!report.training.eligible && <div style={bad}>{report.training.eligibilityReasons.join("；")}</div>}
      </section>

      <section style={panel}><div style={sectionHead}><div><h2 style={{ margin: 0 }}>今日摘要說明</h2><p style={muted}>可直接複製或下載 TXT；JSON 則保留完整 features，供後續策略統計與訓練。</p></div></div><pre style={summary}>{report.summaryText}</pre></section>
      <section style={panel}><h2 style={{ marginTop: 0 }}>資料來源日期</h2><div style={sourceGrid}>{Object.entries(report.sourceDates).map(([k, v]) => <div style={miniCard} key={k}><small style={muted}>{k}</small><strong>{v ?? "待補"}</strong></div>)}</div></section>
    </>}
  </div></main>;
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) { return <div style={card}><small style={muted}>{label}</small><div style={{ fontSize: "calc(var(--twst-body-font) + 5px)", fontWeight: 900, marginTop: 7 }}>{value}</div><div style={{ ...muted, marginTop: 5 }}>{note}</div></div>; }
function Mini({ label, value, change, date, valid }: { label: string; value: string; change: number | null; date: string | null; valid: boolean }) { return <div style={{ ...miniCard, borderColor: valid ? "#243244" : "#b45309" }}><small style={muted}>{label}</small><strong style={{ fontSize: "var(--twst-body-font)" }}>{value}</strong><span style={{ color: valid ? tone(change) : "#fbbf24" }}>{valid ? pct(change) : "⚠ 不納入模型"}</span><small style={muted}>資料日 {date ?? "—"}</small></div>; }
function Stock({ r }: { r: Row }) { return <a href={`/stock/${r.symbol}`} style={stock}>{r.symbol} {r.stockName}</a>; }
function DataTable({ headers, rows }: { headers: string[]; rows: any[][] }) { return <div style={{ overflowX: "auto" }}><table className="twst-stock-data" style={table}><thead><tr>{headers.map(h => <th key={h} style={th}>{h}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{row.map((v, j) => <td key={j} style={td}>{v}</td>)}</tr>)}{!rows.length && <tr><td style={td} colSpan={headers.length}>今日尚無資料。</td></tr>}</tbody></table></div>; }

const page = { minHeight: "100vh", background: "#020617", color: "#e2e8f0", padding: "28px 18px" } as const;
const wrap = { maxWidth: 1600, margin: "0 auto" } as const;
const head = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" } as const;
const eye = { color: "#22d3ee", fontWeight: 900 } as const;
const muted = { color: "#94a3b8", lineHeight: 1.55 } as const;
const actions = { display: "flex", gap: 9, flexWrap: "wrap" } as const;
const button = { border: "1px solid #475569", background: "#1e293b", color: "#fff", borderRadius: 10, padding: "9px 13px", fontWeight: 800, cursor: "pointer" } as const;
const downloadedButton = { ...button, background: "#14532d", borderColor: "#16a34a" } as const;
const primary = { ...button, background: "#0f766e", borderColor: "#0f766e" } as const;
const buttonLink = { ...button, textDecoration: "none" } as const;
const tinyLink = { ...buttonLink, padding: "7px 10px" } as const;
const toolbar = { display: "flex", alignItems: "flex-end", gap: 9, flexWrap: "wrap", marginTop: 18, padding: 14, background: "#0f172a", border: "1px solid #243244", borderRadius: 14 } as const;
const label = { display: "grid", gap: 5, color: "#94a3b8", fontWeight: 800 } as const;
const select = { background: "#020617", color: "#e2e8f0", border: "1px solid #475569", borderRadius: 8, padding: "9px 12px" } as const;
const scheduleBar = { marginTop: 16, padding: 14, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", background: "#082f49", border: "1px solid #0e7490", borderRadius: 14 } as const;
const exportStrip = { marginTop: 12, padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10, background: "#0b1220", border: "1px solid #334155", borderRadius: 14 } as const;
const bad = { marginTop: 14, padding: 13, border: "1px solid #be123c", background: "#4c0519", borderRadius: 12, color: "#fecdd3" } as const;
const panel = { background: "#0f172a", border: "1px solid #243244", borderRadius: 15, padding: 16, marginTop: 16 } as const;
const sectionHead = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" } as const;
const metrics = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10, marginTop: 15 } as const;
const card = { background: "#020617", border: "1px solid #243244", borderRadius: 12, padding: 13 } as const;
const riskBadge = { background: "#450a0a", border: "1px solid #991b1b", borderRadius: 12, padding: "10px 14px", fontWeight: 900 } as const;
const quoteGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(175px,1fr))", gap: 10, marginTop: 13 } as const;
const miniCard = { display: "grid", gap: 5, background: "#020617", border: "1px solid #243244", borderRadius: 11, padding: 11 } as const;
const reasonBox = { display: "grid", gap: 5, marginTop: 13, padding: 12, borderRadius: 10, background: "#020617", color: "#cbd5e1" } as const;
const pill = { background: "#312e81", color: "#c4b5fd", borderRadius: 999, padding: "6px 10px", fontWeight: 900 } as const;
const twoCols = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(520px,1fr))", gap: 14 } as const;
const table = { width: "100%", borderCollapse: "collapse", marginTop: 10 } as const;
const th = { textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #334155", color: "#cbd5e1", whiteSpace: "nowrap", fontWeight: 900 } as const;
const td = { padding: "10px 8px", borderBottom: "1px solid #1e293b", whiteSpace: "nowrap" } as const;
const stock = { color: "#67e8f9", fontWeight: 900, textDecoration: "none" } as const;
const summary = { whiteSpace: "pre-wrap", background: "#020617", border: "1px solid #243244", borderRadius: 12, padding: 15, color: "#dbeafe", lineHeight: 1.75, overflowX: "auto", fontSize: "var(--twst-body-font)" } as const;
const sourceGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 9 } as const;
