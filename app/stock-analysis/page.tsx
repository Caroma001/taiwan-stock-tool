"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchJson } from "@/lib/http/fetch-json";
import { PROJECT_RELEASE } from "@/lib/version/project-version";

const sectors = [
  ["all", "綜合"], ["ai", "AI／伺服器"], ["pcb", "PCB"], ["cooling", "散熱"],
  ["memory", "記憶體"], ["cpo", "矽光子／CPO"], ["robot", "機器人"],
  ["defense", "航太軍工"], ["auto", "車用"], ["etf", "ETF"],
] as const;
const num = (v: unknown, digits = 2) => v == null ? "—" : Number(v).toLocaleString("zh-TW", { maximumFractionDigits: digits });

export default function StockAnalysisCenter() {
  const [sector, setSector] = useState("all");
  const [picks, setPicks] = useState<any[]>([]);
  const [symbol, setSymbol] = useState("");
  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState<"overview" | "technical" | "history" | "reason">("overview");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadPicks = useCallback(async () => {
    try {
      const payload = await fetchJson<any>(`/api/sector-picks?sector=${sector}&top=3`, { cache: "no-store" });
      setPicks(payload.rows ?? []);
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [sector]);

  useEffect(() => { void loadPicks(); }, [loadPicks]);

  async function analyze(target = symbol) {
    const normalized = String(target).trim();
    if (!/^\d{4,6}$/.test(normalized)) { setError("請輸入 4～6 碼股票代號"); return; }
    setBusy(true); setError("");
    try {
      const payload = await fetchJson<any>(`/api/stock-detail?symbol=${encodeURIComponent(normalized)}`, { cache: "no-store" });
      setData(payload); setSymbol(normalized); setTab("overview");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  const status = useMemo(() => {
    if (!data) return "請從產業 Top 3 選擇股票，或自行輸入股票代號。";
    return `${data.symbol} ${data.name}｜${data.quote?.tradeDate ?? "尚無交易日"}｜資料來源：Turso`;
  }, [data]);

  return <main style={S.page}><div style={S.wrap}>
    <header style={S.header}><div><div style={S.eye}>Bruce TWST-AI {PROJECT_RELEASE}</div><h1 style={{margin:"8px 0"}}>個股分析中心</h1><p style={S.muted}>整合個股 AI 分析與技術指標；預設只展示各領域評分最高的 3 檔，需要其他股票時再單獨查詢。</p></div></header>

    {error && <div style={S.error}>{error}</div>}

    <section style={S.panel}>
      <div style={S.sectionHead}><div><h2 style={{margin:0}}>領域 Top 3</h2><p style={S.muted}>只顯示值得優先研究的少量候選，不載入兩千多檔完整清單。</p></div></div>
      <div style={S.chips}>{sectors.map(([key,label]) => <button key={key} onClick={()=>setSector(key)} style={{...S.chip,...(sector===key?S.chipActive:{})}}>{label}</button>)}</div>
      <div style={S.pickGrid}>{picks.length ? picks.map((r:any,index:number)=><article key={r.symbol} style={S.pickCard}>
        <div style={S.rank}>#{index+1}</div><div><strong style={{fontSize:18}}>{r.symbol} {r.name}</strong><div style={S.muted}>{r.industry || r.market || "未分類"}</div></div>
        <div style={S.pickStats}><span>AI <b style={{color:"#22d3ee"}}>{num(r.ai_score,1)}</b></span><span>現價 <b>{num(r.close)}</b></span><span>{r.recommendation || "待判斷"}</span></div>
        <button style={S.primary} onClick={()=>void analyze(r.symbol)}>查看完整分析</button>
      </article>) : <div style={S.empty}>此分類目前沒有足夠的已分析資料。</div>}</div>
    </section>

    <section style={S.searchPanel}><input value={symbol} onChange={e=>setSymbol(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void analyze();}} placeholder="輸入股票代號，例如 3491" style={S.input}/><button disabled={busy} onClick={()=>void analyze()} style={S.primary}>{busy?"查詢中…":"立即分析"}</button></section>
    <div style={S.notice}>{status}</div>

    {data && <>
      <section style={S.cards}>{[
        ["最新收盤",num(data.quote?.close)], ["漲跌幅",data.quote?.changePct==null?"—":`${Number(data.quote.changePct)>=0?"+":""}${num(data.quote.changePct)}%`],
        ["AI 分數",num(data.analysis?.score,1)], ["AI 建議",data.analysis?.recommendation||"尚未分析"], ["目標價",num(data.analysis?.target1)], ["停損價",num(data.analysis?.stopLoss)]
      ].map(([a,b])=><Card key={String(a)} label={String(a)} value={String(b)}/>)}</section>

      <div style={S.tabs}>{[
        ["overview","綜合判讀"],["technical","技術指標"],["history","價格走勢"],["reason","AI 說明"]
      ].map(([k,l])=><button key={k} onClick={()=>setTab(k as any)} style={{...S.tab,...(tab===k?S.tabActive:{})}}>{l}</button>)}</div>

      {tab==="overview" && <section style={S.panel}><h2>綜合判讀</h2><div style={S.cards}>{[
        ["信心",data.analysis?.confidence==null?"—":`${num(data.analysis.confidence,1)}%`], ["預期報酬",data.analysis?.expectedReturn==null?"—":`${num(data.analysis.expectedReturn)}%`],
        ["風報比",num(data.analysis?.riskReward)], ["最高／最低",`${num(data.quote?.high)}／${num(data.quote?.low)}`], ["成交量",num(data.quote?.volume,0)], ["產業",data.industry||"—"]
      ].map(([a,b])=><Card key={String(a)} label={String(a)} value={String(b)}/>)}</div></section>}

      {tab==="technical" && <section style={S.panel}><h2>技術指標</h2><div style={S.cards}>{[
        ["MA5",num(data.indicators?.ma5)],["MA20",num(data.indicators?.ma20)],["MA60",num(data.indicators?.ma60)],["MA240",num(data.indicators?.ma240)],
        ["RSI14",num(data.indicators?.rsi14)],["K／D",`${num(data.indicators?.k)}／${num(data.indicators?.d)}`],["MACD",num(data.indicators?.macd,4)],["MACD Signal",num(data.indicators?.macdSignal,4)]
      ].map(([a,b])=><Card key={String(a)} label={String(a)} value={String(b)}/>)}</div></section>}

      {tab==="history" && <section style={S.panel}><h2>近 90 個交易日</h2><div style={{height:360}}><ResponsiveContainer><LineChart data={data.history??[]}><XAxis dataKey="date" minTickGap={28} stroke="#64748b"/><YAxis domain={["auto","auto"]} stroke="#64748b"/><Tooltip contentStyle={{background:"#0f172a",border:"1px solid #334155"}}/><Line type="monotone" dataKey="close" stroke="#22d3ee" dot={false} strokeWidth={2}/></LineChart></ResponsiveContainer></div></section>}

      {tab==="reason" && <section style={S.panel}><h2>AI 判斷說明</h2>{(data.analysis?.reasons??[]).length?<ol>{data.analysis.reasons.map((r:string,i:number)=><li key={i} style={{marginBottom:10}}>{r}</li>)}</ol>:<p style={S.muted}>目前尚無足夠理由資料。可透過每日一鍵更新或重新分析補齊。</p>}{data.analysis?.reason&&<p style={S.muted}>{data.analysis.reason}</p>}</section>}
    </>}
  </div></main>;
}

function Card({label,value}:{label:string;value:string}){return <article style={S.card}><span style={S.muted}>{label}</span><strong style={{fontSize:22}}>{value}</strong></article>}
const S:any={page:{minHeight:"100vh",background:"#020617",color:"#e2e8f0",padding:"28px 18px"},wrap:{maxWidth:1450,margin:"0 auto"},header:{display:"flex",justifyContent:"space-between",gap:18,flexWrap:"wrap"},eye:{color:"#22d3ee",fontWeight:900},muted:{color:"#94a3b8"},error:{marginTop:16,padding:14,borderRadius:12,background:"#4c0519",border:"1px solid #be123c",color:"#fecdd3"},panel:{marginTop:16,padding:18,borderRadius:16,background:"#0f172a",border:"1px solid #243244"},sectionHead:{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"},chips:{display:"flex",gap:8,flexWrap:"wrap",marginTop:14},chip:{padding:"8px 12px",borderRadius:999,border:"1px solid #334155",background:"#111827",color:"#cbd5e1",cursor:"pointer",fontWeight:800},chipActive:{background:"#0e7490",borderColor:"#22d3ee",color:"#fff"},pickGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(270px,1fr))",gap:12,marginTop:16},pickCard:{position:"relative",padding:16,borderRadius:14,background:"#020617",border:"1px solid #334155",display:"grid",gap:12},rank:{position:"absolute",right:12,top:10,color:"#a78bfa",fontWeight:900},pickStats:{display:"flex",gap:12,flexWrap:"wrap",color:"#cbd5e1"},primary:{padding:"10px 14px",border:0,borderRadius:9,background:"#0284c7",color:"white",fontWeight:900,cursor:"pointer"},empty:{padding:20,color:"#94a3b8"},searchPanel:{display:"flex",gap:8,marginTop:18},input:{flex:1,padding:13,borderRadius:10,border:"1px solid #334155",background:"#0f172a",color:"white"},notice:{marginTop:12,padding:12,borderRadius:10,background:"#083344",color:"#cffafe"},cards:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:10,marginTop:16},card:{padding:15,borderRadius:12,background:"#0f172a",border:"1px solid #243244",display:"grid",gap:7},tabs:{display:"flex",gap:8,flexWrap:"wrap",marginTop:18},tab:{padding:"10px 14px",borderRadius:9,border:"1px solid #334155",background:"#1e293b",color:"#94a3b8",fontWeight:900,cursor:"pointer"},tabActive:{background:"#6d28d9",borderColor:"#8b5cf6",color:"white"}};
