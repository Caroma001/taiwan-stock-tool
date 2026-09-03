"use client";
import { useCallback,useEffect,useState } from "react";
import { PROJECT_RELEASE } from "@/lib/version/project-version";

type Row={symbol:string;stock_name?:string|null;score:number;grade:string;action:string;confidence:number;chip_score:number;momentum_score:number;relative_strength_score:number;foreign_stealth_score:number;fundamental_score:number;market_score:number;washout_score:number;data_quality_score?:number;margin_available?:boolean;fundamental_available?:boolean;price20_available?:boolean;market_available?:boolean};
const fmt=(v:unknown,d=1)=>Number.isFinite(Number(v))?Number(v).toFixed(d):"—";
const show=(v:unknown,a:boolean|undefined,d=1)=>a===false?"—":fmt(v,d);

export default function BruceScore(){
 const [rows,setRows]=useState<Row[]>([]),[date,setDate]=useState(""),[err,setErr]=useState("");
 const load=useCallback(async()=>{try{const r=await fetch(`/api/m8121/bruce-score?limit=30&_=${Date.now()}`,{cache:"no-store"});const p=await r.json();if(!r.ok||!p.ok)throw new Error(p.error||"Bruce Score 讀取失敗");setRows(p.rows??[]);setDate(p.tradeDate??"");setErr("")}catch(e){setErr(e instanceof Error?e.message:String(e))}},[]);
 useEffect(()=>{void load()},[load]);
 const quality=rows.length?Number(rows[0]?.data_quality_score??0):null;
 return <main style={page}><div style={wrap}>
  <div style={eye}>TWSTOCK {PROJECT_RELEASE} · BRUCE SWING SCORE 2.1</div>
  <h1>Bruce Score｜5–10 日交叉驗證</h1>
  <p style={muted}>M8.12.3：缺資料不再當 0 分；Fundamental / Margin 缺值採中性 50，但畫面顯示「—」。信心分數改由個股資料品質、Data Quality Gate 與可用權重共同計算。</p>
  <div style={notice}>交易日 {date||"—"}{quality?` ｜ Data Quality ${fmt(quality,0)}/100`:""} ｜ 法人25%・價量20%・RS15%・外資15%・基本面10%・市場10%・洗淨5%</div>
  <div style={legend}><span>「—」＝資料不足，不代表 0 分</span><span>缺 Fundamental / Margin 時內部採中性 50</span><span>高當沖只在有資料時扣分</span></div>
  {err&&<div style={bad}>{err}</div>}
  <div style={{overflowX:"auto",marginTop:14}}><table style={table}><thead><tr>{["#","股票","Bruce","級別","判斷","信心","法人","動能","RS","外資","基本面","市場","洗淨"].map(x=><th style={th} key={x}>{x}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={r.symbol}>
    <td style={td}>#{i+1}</td><td style={td}><a href={`/stock/${r.symbol}`} style={link}>{r.symbol} {r.stock_name??""}</a></td><td style={{...td,fontWeight:900}}>{fmt(r.score)}</td><td style={td}>{r.grade}</td><td style={td}>{r.action}</td><td style={td}>{fmt(r.confidence,0)}%</td><td style={td}>{fmt(r.chip_score)}</td><td style={td}>{fmt(r.momentum_score)}</td><td style={td}>{show(r.relative_strength_score,r.price20_available)}</td><td style={td}>{fmt(r.foreign_stealth_score)}</td><td style={td} title={r.fundamental_available===false?"資料不足；計分採中性 50":undefined}>{show(r.fundamental_score,r.fundamental_available)}</td><td style={td}>{show(r.market_score,r.market_available)}</td><td style={td} title={r.margin_available===false?"資料不足；計分採中性 50":undefined}>{show(r.washout_score,r.margin_available)}</td>
  </tr>)}</tbody></table></div>
 </div></main>
}

const page:React.CSSProperties={minHeight:"100vh",background:"#020617",color:"#e2e8f0",padding:"28px 18px"},wrap:React.CSSProperties={maxWidth:1500,margin:"0 auto"},eye={color:"#22d3ee",fontWeight:900},muted={color:"#94a3b8"},notice:React.CSSProperties={padding:12,border:"1px solid #0e7490",borderRadius:10,background:"#083344"},legend:React.CSSProperties={display:"flex",flexWrap:"wrap",gap:12,marginTop:10,color:"#cbd5e1",fontSize:13},bad:React.CSSProperties={padding:12,marginTop:12,background:"#4c0519",border:"1px solid #be123c",borderRadius:10},table:React.CSSProperties={width:"100%",borderCollapse:"collapse",minWidth:1150,background:"#0f172a"},th:React.CSSProperties={padding:9,textAlign:"left",borderBottom:"1px solid #334155",color:"#94a3b8"},td:React.CSSProperties={padding:9,borderBottom:"1px solid #1e293b"},link:React.CSSProperties={color:"#67e8f9",textDecoration:"none"};
