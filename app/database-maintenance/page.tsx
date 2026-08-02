"use client";
import { useCallback, useEffect, useState } from "react";

type TableInfo={table_name:string;estimated_rows:number;total_size:string};
type Status={databaseSize:string;checkedAt:string;adapter:string;latencyMs:number;sqliteVersion:string;tables:TableInfo[]};
const actions=[
 {id:"tasks_7d",title:"清除過期 Pipeline 任務",text:"刪除七天前已完成或失敗的工作任務。"},
 {id:"logs_30d",title:"清除過期 Pipeline 執行紀錄",text:"刪除三十天前已完成或失敗的執行紀錄。"},
 {id:"ai_history_30d",title:"清理過期驗證指標",text:"只保留近九十天可供驗證與學習的每日指標。"},
 {id:"ranking_30d",title:"清理舊 Top 30 快照",text:"只保留近九十天的排名快照。"},
 {id:"all_safe",title:"執行安全完整保養",text:"執行以上安全清理，不刪除股票、股價、持股與交易紀錄。"},
] as const;
export default function Page(){
 const [status,setStatus]=useState<Status|null>(null);const [error,setError]=useState("");const [message,setMessage]=useState("");const [busy,setBusy]=useState<string|null>(null);
 const refresh=useCallback(async()=>{try{const r=await fetch("/api/database-maintenance/status",{cache:"no-store"});const p=await r.json();if(!r.ok||!p.ok)throw new Error(p.error??"讀取失敗");setStatus(p.status);setError("");}catch(e){setError(e instanceof Error?e.message:String(e));}},[]);
 useEffect(()=>{void refresh()},[refresh]);
 async function cleanup(action:string,title:string){if(!confirm(`確定執行「${title}」？\n不會刪除股票主檔、股價、持股及交易紀錄。`))return;setBusy(action);setError("");setMessage("執行中……");try{const r=await fetch("/api/database-maintenance/cleanup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,confirmation:"CLEAN"})});const p=await r.json();if(!r.ok||!p.ok)throw new Error(p.error??"清理失敗");setMessage(`完成：刪除 ${Number(p.result?.rowsDeleted??0).toLocaleString("zh-TW")} 筆。`);await refresh();}catch(e){setMessage("");setError(e instanceof Error?e.message:String(e));}finally{setBusy(null)}}
 return <main style={page}><div style={eye}>twstock M7.4.3</div><h1>Turso 資料庫健康中心</h1><p style={muted}>此頁已完全移除 Supabase，直接檢查與維護 Turso。</p>
 {error&&<div style={bad}>{error}</div>}{message&&<div style={good}>{message}</div>}
 <section style={panel}><div style={grid}><Card label="資料庫" value="Turso"/><Card label="健康延遲" value={status?`${status.latencyMs} ms`:"讀取中"}/><Card label="SQLite" value={status?.sqliteVersion??"—"}/><Card label="估計容量" value={status?.databaseSize??"—"}/><Card label="資料表" value={String(status?.tables.length??0)}/></div><button style={button} onClick={()=>void refresh()}>重新檢查</button></section>
 <h2>安全清理</h2><div style={actionsGrid}>{actions.map(a=><section key={a.id} style={panel}><h3>{a.title}</h3><p style={muted}>{a.text}</p><button style={{...button,background:a.id==="all_safe"?"#7c3aed":"#1d4ed8"}} disabled={busy!==null} onClick={()=>void cleanup(a.id,a.title)}>{busy===a.id?"執行中……":"執行清理"}</button></section>)}</div>
 <h2>資料表概況</h2><section style={{...panel,overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><th style={cell}>資料表</th><th style={cell}>筆數</th><th style={cell}>容量</th></tr></thead><tbody>{(status?.tables??[]).map(t=><tr key={t.table_name}><td style={cell}>{t.table_name}</td><td style={cell}>{t.estimated_rows.toLocaleString("zh-TW")}</td><td style={cell}>{t.total_size}</td></tr>)}</tbody></table></section>
 </main>}
function Card({label,value}:{label:string;value:string}){return <div style={card}><span style={muted}>{label}</span><strong style={{fontSize:24}}>{value}</strong></div>}
const page:React.CSSProperties={minHeight:"100vh",background:"#020617",color:"#e5eefc",padding:28,maxWidth:1500,margin:"0 auto"};const eye={color:"#22d3ee",fontWeight:800};const muted={color:"#94a3b8"};const panel:React.CSSProperties={background:"#0f172a",border:"1px solid #1e293b",borderRadius:14,padding:18,marginBottom:18};const grid:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:10,marginBottom:14};const card:React.CSSProperties={background:"#111827",border:"1px solid #334155",borderRadius:12,padding:15,display:"flex",flexDirection:"column",gap:7};const actionsGrid:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:12};const button:React.CSSProperties={border:0,borderRadius:9,padding:"10px 14px",background:"#0e7490",color:"white",fontWeight:800,cursor:"pointer"};const cell:React.CSSProperties={padding:10,textAlign:"left",borderBottom:"1px solid #334155"};const bad:React.CSSProperties={padding:14,borderRadius:10,background:"#4c0519",border:"1px solid #be123c",margin:"14px 0"};const good:React.CSSProperties={padding:14,borderRadius:10,background:"#052e2b",border:"1px solid #0f766e",margin:"14px 0"};
