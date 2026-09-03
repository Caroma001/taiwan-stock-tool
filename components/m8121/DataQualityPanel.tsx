"use client";
import { useCallback,useEffect,useRef,useState } from "react";

type Q={tradeDate:string;score:number;level:"green"|"yellow"|"red";publishMode:"full"|"degraded"|"blocked";reportExists:boolean;sources:Array<{key:string;ok:boolean;rows:number;minRows:number}>;warnings:string[]};

export default function DataQualityPanel(){
  const [q,setQ]=useState<Q|null>(null);
  const [msg,setMsg]=useState("");
  const recovered=useRef("");
  const load=useCallback(async()=>{
    try{
      const r=await fetch(`/api/m8121/quality?_=${Date.now()}`,{cache:"no-store"});const p=await r.json();
      if(!r.ok||!p.ok)throw new Error(p.error||"Data Quality 讀取失敗");
      setQ(p.quality);setMsg("");
    }catch(e){setMsg(e instanceof Error?e.message:String(e));}
  },[]);
  useEffect(()=>{void load();const t=window.setInterval(()=>void load(),30000);return()=>window.clearInterval(t)},[load]);

  useEffect(()=>{
    if(!q||q.publishMode==="blocked"||q.reportExists||recovered.current===q.tradeDate)return;
    recovered.current=q.tradeDate;
    void(async()=>{
      try{
        setMsg(`M8.12.3：${q.publishMode==="degraded"?"資料不完整，補產降級日報":"資料完整，補產日報"}…`);
        const r=await fetch("/api/m8121/recover-report",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({date:q.tradeDate})});
        const p=await r.json();if(!r.ok||!p.ok)throw new Error(p.error||p.reason||"補產失敗");
        setMsg(`✅ ${q.tradeDate} 日報已補產`);await load();
      }catch(e){setMsg(e instanceof Error?e.message:String(e));}
    })();
  },[q,load]);

  if(!q)return <section style={panel}><b>M8.12.3 Data Quality Gate</b><div style={muted}>{msg||"讀取中…"}</div></section>;
  const color=q.level==="green"?"#4ade80":q.level==="yellow"?"#fbbf24":"#fb7185";
  return <section style={{...panel,borderColor:color}}>
    <div style={head}><div><div style={eye}>M8.12.3 DATA QUALITY GATE</div><h2 style={{margin:"5px 0"}}>資料品質 {q.score}/100 · {q.publishMode.toUpperCase()}</h2><div style={muted}>核心價格完整時，其他來源不足不再讓日報消失。</div></div><b style={{color}}>{q.level.toUpperCase()}</b></div>
    <div style={grid}>{q.sources.map(s=><div style={card} key={s.key}><small style={muted}>{s.key.toUpperCase()}</small><b>{s.ok?"✅ OK":"⚠ 不足"}</b><span>{s.rows}/{s.minRows}</span></div>)}</div>
    <div style={{marginTop:9,color:q.reportExists?"#4ade80":"#fbbf24"}}>日報：{q.reportExists?"✅ 已存在":"⏳ 自動補產"}</div>
    {!!q.warnings.length&&<div style={warn}>{q.warnings.slice(0,4).join(" ／ ")}</div>}
    {msg&&<div style={{marginTop:8}}>{msg}</div>}
  </section>;
}
const panel:React.CSSProperties={maxWidth:1400,margin:"16px auto",padding:16,border:"1px solid #0e7490",borderRadius:14,background:"#0f172a",color:"#e2e8f0"};
const head:React.CSSProperties={display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"};const eye={color:"#22d3ee",fontWeight:900};const muted={color:"#94a3b8"};const grid:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:8,marginTop:12};const card:React.CSSProperties={padding:10,border:"1px solid #334155",borderRadius:10,background:"#020617",display:"grid",gap:4};const warn:React.CSSProperties={marginTop:9,padding:9,borderRadius:9,background:"#422006",color:"#fde68a"};
