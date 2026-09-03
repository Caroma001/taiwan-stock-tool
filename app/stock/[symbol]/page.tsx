"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PROJECT_RELEASE } from "@/lib/version/project-version";

const number = (value: unknown, digits = 2) => value == null ? "—" : Number(value).toLocaleString("zh-TW", { maximumFractionDigits: digits });
const lots = (value: unknown) => value == null || !Number.isFinite(Number(value)) ? "—" : `${(Number(value) / 1000).toLocaleString("zh-TW", { maximumFractionDigits: 3 })} 張`;

export default function StockDetailPage() {
  const params = useParams<{ symbol: string }>();
  const symbol = String(params.symbol ?? "");
  const [data, setData] = useState<any>(null);
  const [message, setMessage] = useState("正在讀取最新可用資訊……");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/stock-detail?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!payload.ok) throw new Error(payload.error || "讀取失敗");
      setData(payload);
      setMessage(`報價來源：${payload.quote?.source ?? "—"}；交易日 ${payload.quote?.tradeDate ?? "—"}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }
  }, [symbol]);

  useEffect(() => { void load(); }, [load]);

  async function analyze() {
    setBusy(true);
    setMessage("正在抓取最新資料並重新計算技術指標與 AI 決策……");
    try {
      let add = await fetch("/api/hot-stocks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol, reason: "M8.3 個股即時查詢" }) });
      if (!add.ok) {
        const payload = await add.json();
        if (!String(payload.error ?? "").includes("已")) throw new Error(payload.error || "加入分析池失敗");
      }
      const response = await fetch("/api/hot-stocks/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol }) });
      const payload = await response.json();
      if (!payload.ok) throw new Error(payload.error || "重新分析失敗");
      await load();
      setMessage("最新資料與分析已更新。");
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  return <main style={page}>
    <header style={header}>
      <div><div style={eye}>{PROJECT_RELEASE} 個股最新資訊</div><h1>{symbol} {data?.name ?? ""}</h1><p style={muted}>{data?.market ?? ""}｜{data?.industry ?? ""}</p></div>
      <div style={actions}><button style={primary} disabled={busy} onClick={() => void analyze()}>{busy ? "處理中…" : "更新並重新分析"}</button><button style={secondary} onClick={() => void load()}>重新讀取</button><a style={secondary} href="/swing10">返回 Swing10</a></div>
    </header>
    <div style={notice}>{message}</div>
    <section style={cards}>
      <Card label="最新收盤" value={number(data?.quote?.close)} />
      <Card label="漲跌幅" value={data?.quote?.changePct == null ? "—" : `${data.quote.changePct >= 0 ? "+" : ""}${number(data.quote.changePct)}%`} />
      <Card label="最高／最低" value={`${number(data?.quote?.high)}／${number(data?.quote?.low)}`} />
      <Card label="成交量" value={number(data?.quote?.volume, 0)} />
      <Card label="AI 分數" value={number(data?.analysis?.score, 1)} />
      <Card label="建議" value={data?.analysis?.recommendation ?? "尚未分析"} />
    </section>
    <section style={panel}><h2>價格與均線</h2><div style={{ width: "100%", height: 360 }}><ResponsiveContainer><LineChart data={data?.history ?? []}><CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/><XAxis dataKey="date" minTickGap={28} stroke="#64748b"/><YAxis domain={["auto", "auto"]} stroke="#64748b"/><Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }}/><Legend/><Line type="monotone" dataKey="close" name="收盤" stroke="#22d3ee" dot={false} strokeWidth={2}/><Line type="monotone" dataKey="ma20" name="MA20" stroke="#f59e0b" dot={false}/><Line type="monotone" dataKey="ma60" name="MA60" stroke="#a78bfa" dot={false}/></LineChart></ResponsiveContainer></div></section>
    <section style={panel}><h2>成交量</h2><div style={{width:"100%",height:240}}><ResponsiveContainer><BarChart data={data?.history ?? []}><CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/><XAxis dataKey="date" minTickGap={28} stroke="#64748b"/><YAxis stroke="#64748b"/><Tooltip contentStyle={{background:"#0f172a",border:"1px solid #334155"}}/><Bar dataKey="volume" name="成交量" fill="#0891b2"/></BarChart></ResponsiveContainer></div></section>
    <section style={panel}><h2>技術指標</h2><div style={grid}>{[["MA5",data?.indicators?.ma5],["MA20",data?.indicators?.ma20],["MA60",data?.indicators?.ma60],["MA240",data?.indicators?.ma240],["RSI14",data?.indicators?.rsi14],["K／D",`${number(data?.indicators?.k)}／${number(data?.indicators?.d)}`],["MACD",data?.indicators?.macd]].map(([label,value])=><Card key={String(label)} label={String(label)} value={typeof value === "string" ? value : number(value)} />)}</div></section>
    <section style={panel}><h2>外資吸籌雷達</h2><div style={grid}><Card label="外資吸籌分" value={data?.foreign?.score == null ? "—" : `${number(data.foreign.score,0)}/100`}/><Card label="訊號" value={data?.foreign?.label ?? "資料不足"}/><Card label="近 5 日外資" value={lots(data?.foreign?.foreign5)}/><Card label="近 10 日外資" value={lots(data?.foreign?.foreign10)}/><Card label="近 20 日外資" value={lots(data?.foreign?.foreign20)}/><Card label="同期股價" value={data?.foreign?.price20Pct == null ? "—" : `${Number(data.foreign.price20Pct)>=0?"+":""}${number(data.foreign.price20Pct)}%`}/></div><h3>籌碼判斷</h3><ol>{(data?.foreign?.reasons ?? []).map((reason: string,index:number)=><li key={index} style={{marginBottom:8}}>{reason}</li>)}</ol>{!data?.foreign?.dataDays&&<p style={muted}>尚無足夠法人資料；按「更新並重新分析」後，系統會同步補抓法人資料。</p>}</section>
    <section style={panel}><h2>AI 現況分析</h2><div style={grid}><Card label="信心" value={data?.analysis?.confidence == null ? "—" : `${number(data.analysis.confidence,1)}%`}/><Card label="目標一" value={number(data?.analysis?.target1)}/><Card label="目標二" value={number(data?.analysis?.target2)}/><Card label="停損" value={number(data?.analysis?.stopLoss)}/><Card label="預期報酬" value={data?.analysis?.expectedReturn == null ? "—" : `${number(data.analysis.expectedReturn)}%`}/><Card label="風報比" value={number(data?.analysis?.riskReward)}/></div><h3>分析理由</h3><ol>{(data?.analysis?.reasons ?? []).map((reason: string, index: number)=><li key={index} style={{ marginBottom: 8 }}>{reason}</li>)}</ol>{data?.analysis?.reason && <p style={muted}>{data.analysis.reason}</p>}</section>
  </main>;
}

function Card({label,value}:{label:string;value:string}){return <div style={card}><span style={muted}>{label}</span><strong style={{fontSize:22}}>{value}</strong></div>}
const page:React.CSSProperties={minHeight:"100vh",background:"#020617",color:"#e2e8f0",padding:"28px 18px"};
const header:React.CSSProperties={maxWidth:1400,margin:"0 auto",display:"flex",justifyContent:"space-between",gap:18,flexWrap:"wrap"};
const eye:React.CSSProperties={color:"#22d3ee",fontWeight:900};const muted:React.CSSProperties={color:"#94a3b8"};
const actions:React.CSSProperties={display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"};
const button:React.CSSProperties={padding:"11px 14px",border:0,borderRadius:9,color:"white",fontWeight:800,textDecoration:"none",cursor:"pointer"};
const primary:React.CSSProperties={...button,background:"#2563eb"};const secondary:React.CSSProperties={...button,background:"#334155"};
const notice:React.CSSProperties={maxWidth:1400,margin:"16px auto",padding:14,borderRadius:10,background:"#083344",color:"#cffafe"};
const cards:React.CSSProperties={maxWidth:1400,margin:"16px auto",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:12};
const grid:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12};
const card:React.CSSProperties={padding:16,border:"1px solid #1e293b",borderRadius:12,background:"#0f172a",display:"grid",gap:7};
const panel:React.CSSProperties={maxWidth:1400,margin:"16px auto",padding:20,border:"1px solid #1e293b",borderRadius:14,background:"#0f172a"};
