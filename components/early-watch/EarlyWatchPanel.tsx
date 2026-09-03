"use client";

import { useCallback, useEffect, useState } from "react";

type EarlyWatchRow={
  tradeDate:string;symbol:string;stockName:string;rank:number;tier:string;earlyWatchScore:number;fundamentalScore:number;catalystScore:number;
  priceNotPricedScore:number;accumulationScore:number;technicalSetupScore:number;revenueDataMonth:string|null;revenueYoyPct:number|null;revenueMomPct:number|null;
  revenueCumulativeYoyPct:number|null;revenueYoyAcceleration:number|null;price20Pct:number|null;foreign20:number|null;foreignBuyDays20:number|null;catalystCount:number;
  catalysts:Array<{id:string;eventDate:string;eventType:string;title:string;score:number}>;sourceConfidencePct:number;reasons:string[];
};
type EarlyWatchData={ok:boolean;tradeDate:string|null;summary:{total:number;strong:number;watch:number;revenueMonth:string|null;externalRequests?:number};rows:EarlyWatchRow[];error?:string};

const pct=(v:number|null)=>v==null?"—":`${v>=0?"+":""}${v.toFixed(1)}%`;
const score=(v:number)=>v.toFixed(1);
const panel:React.CSSProperties={marginTop:18,background:"#0f172a",border:"1px solid #0e7490",borderRadius:16,padding:18};
const actions:React.CSSProperties={display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"};
const button:React.CSSProperties={border:"1px solid #475569",borderRadius:9,background:"#1e293b",color:"#fff",padding:"9px 12px",fontWeight:800,cursor:"pointer"};
const primary:React.CSSProperties={...button,background:"#0f766e",border:0};
const muted:React.CSSProperties={color:"#94a3b8",lineHeight:1.6,margin:"5px 0"};
const table:React.CSSProperties={width:"100%",borderCollapse:"collapse",marginTop:12};
const th:React.CSSProperties={padding:"9px 7px",textAlign:"left",color:"#94a3b8",borderBottom:"1px solid #334155",whiteSpace:"nowrap",fontSize:12};
const td:React.CSSProperties={padding:"9px 7px",borderBottom:"1px solid #1e293b",fontSize:12,verticalAlign:"top"};
const input:React.CSSProperties={background:"#020617",color:"#fff",border:"1px solid #475569",borderRadius:8,padding:"8px 9px"};

export default function EarlyWatchPanel({tradeDate}:{tradeDate:string|null}){
  const [data,setData]=useState<EarlyWatchData|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [showEvent,setShowEvent]=useState(false);
  const [form,setForm]=useState({symbol:"",eventDate:tradeDate??"",eventType:"contract",title:"",score:"",sourceUrl:"",activeUntil:""});

  const load=useCallback(async()=>{
    try{const r=await fetch(`/api/early-watch?_=${Date.now()}`,{cache:"no-store"});const p=await r.json();if(!p.ok)throw new Error(p.error);setData(p);}catch(e){setMessage(e instanceof Error?e.message:String(e));}
  },[]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{if(tradeDate)setForm(f=>({...f,eventDate:f.eventDate||tradeDate}));},[tradeDate]);

  const refresh=async()=>{setBusy(true);setMessage("正在更新 Early Watch：月營收＋外資吸籌＋價格未反映…");try{const r=await fetch("/api/early-watch/refresh",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tradeDate})});const p=await r.json();if(!p.ok)throw new Error(p.error);setMessage(`Early Watch 完成：${p.total} 檔，EW-A ${p.strongCount??0} 檔。`);await load();}catch(e){setMessage(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
  const addEvent=async()=>{setBusy(true);try{const r=await fetch("/api/early-watch/catalyst",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,score:form.score?Number(form.score):undefined})});const p=await r.json();if(!p.ok)throw new Error(p.error);setMessage(`已加入 ${form.symbol} 催化事件：${form.title}`);setForm(f=>({...f,symbol:"",title:"",score:"",sourceUrl:""}));setShowEvent(false);await refresh();}catch(e){setMessage(e instanceof Error?e.message:String(e));setBusy(false);}};
  const addWatchlist=async(row:EarlyWatchRow)=>{try{const r=await fetch("/api/watchlist",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({symbol:row.symbol,note:`M8.11.8 Early Watch ${row.tier}｜Early ${row.earlyWatchScore.toFixed(1)}｜月營收YoY ${row.revenueYoyPct==null?"—":row.revenueYoyPct.toFixed(1)+"%"}`})});const p=await r.json();if(!p.ok)throw new Error(p.error);setMessage(`${row.symbol} ${row.stockName} 已加入觀察股，現在可在「投資組合」統一觀察。`);}catch(e){setMessage(e instanceof Error?e.message:String(e));}};
  const rows=data?.rows?.slice(0,10)??[];
  return <section style={panel}>
    <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start",flexWrap:"wrap"}}>
      <div><div style={{color:"#22d3ee",fontWeight:900}}>M8.11.8 · EARLY WATCH / CATALYST</div><h2 style={{margin:"7px 0"}}>早期情報觀察池｜校準版：資訊領先、價格落後</h2><p style={muted}>不直接給買進訊號。M8.11.8 對極端營收年增加入低基期降權，EW-A 必須有多類獨立證據；避免 30/30 全部最高級，再交給 Swing10 A0/A1 做真正進場確認。</p></div>
      <div style={actions}><button style={primary} disabled={busy} onClick={()=>void refresh()}>{busy?"處理中…":"更新 Early Watch"}</button><button style={button} onClick={()=>setShowEvent(v=>!v)}>＋ 催化事件</button></div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8,marginTop:12}}>
      <Mini label="資料日" value={data?.tradeDate??"—"}/><Mini label="EW-A 強觀察" value={String(data?.summary?.strong??0)}/><Mini label="EW-A/B" value={String(data?.summary?.watch??0)}/><Mini label="月營收期別" value={data?.summary?.revenueMonth??"—"}/><Mini label="官方請求" value={`${data?.summary?.externalRequests??0} 次`}/>
    </div>
    {message&&<div style={{marginTop:10,padding:10,borderRadius:9,background:"#083344"}}>{message}</div>}
    {showEvent&&<div style={{marginTop:12,padding:12,border:"1px solid #334155",borderRadius:12,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8}}>
      <input style={input} placeholder="股票代號" value={form.symbol} onChange={e=>setForm({...form,symbol:e.target.value})}/>
      <input style={input} type="date" value={form.eventDate} onChange={e=>setForm({...form,eventDate:e.target.value})}/>
      <select style={input} value={form.eventType} onChange={e=>setForm({...form,eventType:e.target.value})}><option value="buyback">庫藏股</option><option value="contract">重大合約/訂單</option><option value="earnings">財報/獲利</option><option value="conference">法說會</option><option value="customer">重大客戶</option><option value="expansion">擴產/投資</option><option value="subsidiary">海外/子公司</option><option value="other">其他</option></select>
      <input style={input} placeholder="事件標題" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/>
      <input style={input} placeholder="分數(可留空)" value={form.score} onChange={e=>setForm({...form,score:e.target.value})}/>
      <input style={input} placeholder="來源URL(可選)" value={form.sourceUrl} onChange={e=>setForm({...form,sourceUrl:e.target.value})}/>
      <button style={primary} disabled={busy||!form.symbol||!form.title} onClick={()=>void addEvent()}>儲存並重算</button>
    </div>}
    {rows.length?<div style={{overflowX:"auto"}}><table style={table}><thead><tr>{["排名","股票","級別","Early","基本面","催化","價格未反映","法人","月營收YoY","YoY加速度","校準","20日股價","理由","操作"].map(x=><th key={x} style={th}>{x}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.symbol}><td style={td}>{r.rank}</td><td style={td}><a href={`/stock/${r.symbol}`} style={{color:"#67e8f9",fontWeight:900,textDecoration:"none"}}>{r.symbol}</a> {r.stockName}</td><td style={{...td,color:tierColor(r.tier),fontWeight:900}}>{r.tier}</td><td style={{...td,fontWeight:900}}>{score(r.earlyWatchScore)}</td><td style={td}>{score(r.fundamentalScore)}</td><td style={td}>{score(r.catalystScore)}{r.catalystCount?` (${r.catalystCount})`:""}</td><td style={td}>{score(r.priceNotPricedScore)}</td><td style={td}>{score(r.accumulationScore)}</td><td style={td}>{pct(r.revenueYoyPct)}</td><td style={td}>{r.revenueYoyAcceleration==null?"—":`${r.revenueYoyAcceleration>=0?"+":""}${r.revenueYoyAcceleration.toFixed(1)}pt`}</td><td style={{...td,color:calibrationColor(r)}}>{calibrationTag(r)}</td><td style={td}>{pct(r.price20Pct)}</td><td style={{...td,maxWidth:380,whiteSpace:"normal",color:"#cbd5e1"}}>{r.reasons.slice(0,4).join("；")}</td><td style={td}><button style={{...button,padding:"6px 9px"}} onClick={()=>void addWatchlist(r)}>加入觀察股</button></td></tr>)}</tbody></table></div>:<div style={{marginTop:12,color:"#94a3b8"}}>尚無 Early Watch 快照；完成每日一鍵更新後會自動建立，也可手動按「更新 Early Watch」。</div>}
  </section>;
}

function Mini({label,value}:{label:string;value:string}){return <div style={{background:"#020617",borderRadius:9,padding:10,display:"flex",flexDirection:"column",gap:5}}><span style={{color:"#94a3b8",fontSize:12}}>{label}</span><b>{value}</b></div>}
function tierColor(tier:string){return tier==="EW-A"?"#4ade80":tier==="EW-B"?"#22d3ee":tier==="WATCH"?"#facc15":"#94a3b8";}

function calibrationTag(row:EarlyWatchRow){
  if(row.reasons.some(x=>x.includes("低基期風險：高"))) return "低基期高";
  if(row.reasons.some(x=>x.includes("低基期風險：中"))) return "低基期中";
  const evidence=row.reasons.find(x=>x.startsWith("獨立證據 "));
  return evidence?.replace("獨立證據 ","證據 ")??"正常";
}
function calibrationColor(row:EarlyWatchRow){
  const tag=calibrationTag(row);
  return tag==="低基期高"?"#fb7185":tag==="低基期中"?"#facc15":"#86efac";
}
