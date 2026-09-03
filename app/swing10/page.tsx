"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PROJECT_RELEASE } from "@/lib/version/project-version";
import EarlyWatchPanel from "@/components/early-watch/EarlyWatchPanel";

type Row={tradeDate:string;symbol:string;stockName:string;rank:number;grade:string;swing10Score:number;decisionScore:number;potentialScore:number;stealthScore:number|null;breakoutScore:number|null;triggerScore:number|null;decisionDelta1d:number|null;decisionDelta3d:number|null;rankDelta1d:number|null;marketRiskLevel:string;marketRiskScore:number|null;marketRiskDelta1d:number|null;marginWashoutScore:number|null;marginWashoutDelta1d:number|null;foreignPersistenceScore:number|null;foreignPersistenceDelta1d:number|null;daytradeRatioPct:number|null;daytradeNoisePenalty:number|null;daytradeNoiseDelta1d:number|null;riskDataConfidencePct:number|null;price20Pct:number|null;entryGatePass:boolean;riskChangeLevel:string;riskChanges:string[];reasons:string[];latestClose?:number|null;latestPriceDate?:string|null;marketPosture?:{posture:string;label:string;reason:string}};
type RecentA={symbol:string;stockName:string;firstADate:string;lastADate:string;aDays:number;currentA:boolean;status:string};
type Data={ok:boolean;tradeDate:string|null;summary:{candidateCount:number;aGradeCount:number;a1Count?:number;a0Count?:number;riskChangedCount:number;reviewed:boolean;reviewedAt?:string|null};rows:Row[];recentA?:RecentA[];error?:string};
type TradePosition={lotId:string;symbol:string;stockName:string;holdingType:"real"|"test";buyDate:string;buyPrice:number;quantityLots:number;targetSellPrice:number|null;entryTradeDate:string;entryGrade:string;entryRank:number|null;entrySwing10Score:number|null;entryDecisionScore:number|null;entryStealthScore:number|null;entryTriggerScore:number|null;takeProfitPct:number;stopLossPct:number;maxHoldingDays:number;currentPrice:number|null;holdingDays:number;returnPct:number|null;maxReturnPct:number|null;drawdownFromPeakPct:number|null;currentGrade:string;currentRank:number|null;currentSwing10Score:number|null;currentDecisionScore:number|null;decisionChangeFromEntry:number|null;currentStealthScore:number|null;foreignPersistenceScore:number|null;marketRiskLevel:string;marketRiskScore:number|null;daytradeNoisePenalty:number|null;action:"hold"|"watch"|"sell_check";severity:string;reasons:string[];alertTradeDate:string|null};
type Perf={closedTrades:number;wins:number;losses:number;winRatePct:number;averageReturnPct:number;totalProfit:number;averageHoldingDays:number};
type TradeData={ok:boolean;tradeDate:string|null;active:TradePosition[];summary:{realOpen:number;testOpen:number;sellCheck:number;watch:number;hold:number;real:Perf;test:Perf};error?:string};
type TradeMode="real"|"test";

const PREF_KEY="twstock:swing10:browser-notification";
const n=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0;
const signed=(v:number|null)=>v==null?"—":`${v>=0?"+":""}${v.toFixed(1)}`;
const num=(v:number|null,d=1)=>v==null?"—":Number(v).toFixed(d);
const money=(v:number|null)=>v==null?"—":Math.round(v).toLocaleString("zh-TW");

export default function Swing10Page(){
  const [data,setData]=useState<Data|null>(null);
  const [tradeData,setTradeData]=useState<TradeData|null>(null);
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const [browserNotify,setBrowserNotify]=useState(false);
  const [tradeRow,setTradeRow]=useState<Row|null>(null);
  const [tradeMode,setTradeMode]=useState<TradeMode>("test");
  const [tradeForm,setTradeForm]=useState({buyPrice:"",quantityLots:"1",buyDate:"",takeProfitPct:"8",stopLossPct:"4.5",maxHoldingDays:"10",note:""});

  const load=useCallback(async()=>{
    try{
      const stamp=Date.now();
      const [swingResponse,tradeResponse]=await Promise.all([
        fetch(`/api/swing10?_=${stamp}`,{cache:"no-store"}),
        fetch(`/api/swing10/trades?_=${stamp}`,{cache:"no-store"}),
      ]);
      const swing=await swingResponse.json();
      const trades=await tradeResponse.json();
      if(!swing.ok) throw new Error(swing.error);
      if(!trades.ok) throw new Error(trades.error);
      setData(swing);setTradeData(trades);
    }catch(e){setMessage(e instanceof Error?e.message:String(e));}
  },[]);

  useEffect(()=>{void load();setBrowserNotify(typeof window!=="undefined"&&localStorage.getItem(PREF_KEY)==="on");},[load]);

  const refresh=async()=>{setBusy(true);setMessage("正在建立今日 Swing10 收盤快照與持股賣出提醒…");try{const r=await fetch("/api/swing10/refresh",{method:"POST",cache:"no-store"});const p=await r.json();if(!p.ok)throw new Error(p.error);setMessage(`Swing10 ${p.tradeDate} 已完成：A級 ${p.aGradeCount} 檔／風險變化 ${p.riskChangedCount} 檔。`);await load();}catch(e){setMessage(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
  const refreshTrades=async()=>{setBusy(true);try{const r=await fetch("/api/swing10/trades/refresh",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tradeDate:data?.tradeDate})});const p=await r.json();if(!p.ok)throw new Error(p.error);setMessage(`持股提醒已更新：續抱 ${p.hold}／注意 ${p.watch}／賣出檢查 ${p.sellCheck}`);await load();}catch(e){setMessage(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
  const reviewed=async()=>{if(!data?.tradeDate)return;setBusy(true);try{const r=await fetch("/api/swing10/review",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tradeDate:data.tradeDate})});const p=await r.json();if(!p.ok)throw new Error(p.error);setMessage("今日 A級候選、風險變化與持股提醒已完成檢查。");await load();}catch(e){setMessage(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
  const toggleNotify=async()=>{if(typeof window==="undefined"||!("Notification" in window)){setMessage("此瀏覽器不支援通知。");return;}if(!browserNotify){const permission=await Notification.requestPermission();if(permission!=="granted"){setMessage("瀏覽器通知未授權；站內收盤提醒仍會保留。");return;}localStorage.setItem(PREF_KEY,"on");setBrowserNotify(true);setMessage("已啟用瀏覽器提醒：收盤後會提示 A級候選與持股賣出檢查。");}else{localStorage.removeItem(PREF_KEY);setBrowserNotify(false);setMessage("已關閉瀏覽器通知；站內提醒仍保留。");}};

  const openTrade=(row:Row,mode:TradeMode)=>{
    setTradeRow(row);setTradeMode(mode);
    setTradeForm({
      buyPrice:row.latestClose==null?"":String(row.latestClose),
      quantityLots:mode==="test"?"1":"0.1",
      buyDate:row.latestPriceDate??row.tradeDate,
      takeProfitPct:"8",stopLossPct:"4.5",maxHoldingDays:"10",note:"",
    });
  };
  const createTrade=async()=>{
    if(!tradeRow)return;setBusy(true);
    try{
      const r=await fetch("/api/swing10/trades",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({symbol:tradeRow.symbol,holdingType:tradeMode,buyPrice:Number(tradeForm.buyPrice),quantityLots:Number(tradeForm.quantityLots),buyDate:tradeForm.buyDate,takeProfitPct:Number(tradeForm.takeProfitPct),stopLossPct:Number(tradeForm.stopLossPct),maxHoldingDays:Number(tradeForm.maxHoldingDays),note:tradeForm.note})});
      const p=await r.json();if(!p.ok)throw new Error(p.error);
      setMessage(p.alreadyExists?`${tradeRow.symbol} 已存在同類型 Swing10 部位。`:`${tradeRow.symbol} 已加入${tradeMode==="test"?"測試":"實際"}部位；系統開始每日追蹤賣出提醒。`);
      setTradeRow(null);await load();
    }catch(e){setMessage(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  };

  const rows=data?.rows??[];
  const aRows=useMemo(()=>rows.filter(r=>r.grade==="A1"||r.grade==="A0"),[rows]);
  const relativeTop5=useMemo(()=>rows.slice(0,5),[rows]);
  const riskRows=useMemo(()=>rows.filter(r=>r.riskChangeLevel==="watch"||r.riskChangeLevel==="high"),[rows]);
  const active=tradeData?.active??[];
  const testHeldSymbols=useMemo(()=>new Set((tradeData?.active??[]).filter(p=>p.holdingType==="test").map(p=>p.symbol)),[tradeData?.active]);
  const alertRows=useMemo(()=>[...active].sort((a,b)=>actionRank(a.action)-actionRank(b.action)||a.symbol.localeCompare(b.symbol)),[active]);

  return <main style={main}><div style={wrap}>
    <header style={header}><div><div style={eye}>TWSTOCK {PROJECT_RELEASE} · SWING10 TRADE</div><h1 style={{margin:"8px 0"}}>Swing10 Opportunity Grade v2｜測試 / 實買 / 賣出提醒</h1><p style={muted}>M8.11.8 保留 A1/A0 Opportunity Grade、持股連續追蹤與多條件退出提醒；Early Watch 改為校準版，極端營收年增會先做低基期降權，EW-A 必須通過多類獨立證據確認，避免候選池全部被判為最高級。</p></div><div style={actions}><button style={primary} disabled={busy} onClick={()=>void refresh()}>{busy?"處理中…":"重新建立今日快照"}</button><button style={button} disabled={busy} onClick={()=>void refreshTrades()}>更新持股提醒</button><button style={button} onClick={()=>void toggleNotify()}>{browserNotify?"🔔 瀏覽器提醒：開":"🔕 啟用瀏覽器提醒"}</button><a style={button} href="/portfolio-manager">投資組合</a></div></header>
    {message&&<div style={messageBox}>{message}</div>}

    <section style={cards}>
      <Metric label="資料日" value={data?.tradeDate??"—"}/><Metric label="A1 確認" value={String(data?.summary?.a1Count??0)}/><Metric label="A0 新機會" value={String(data?.summary?.a0Count??0)}/><Metric label="實際持有" value={String(tradeData?.summary?.realOpen??0)}/><Metric label="測試持有" value={String(tradeData?.summary?.testOpen??0)}/><Metric label="🔴 賣出檢查" value={String(tradeData?.summary?.sellCheck??0)}/><Metric label="🟡 注意" value={String(tradeData?.summary?.watch??0)}/><Metric label="今日檢查" value={data?.summary?.reviewed?"已完成":"待檢查"}/>
    </section>

    <section style={performanceGrid}>
      <Performance title="Swing10 測試績效" perf={tradeData?.summary?.test}/>
      <Performance title="Swing10 實際績效" perf={tradeData?.summary?.real}/>
    </section>

    <EarlyWatchPanel tradeDate={data?.tradeDate??null}/>

    <section style={{...panel,borderColor:data?.summary?.reviewed?"#166534":"#b45309"}}><div style={sectionHead}><div><h2 style={{margin:0}}>每日收盤檢查</h2><p style={muted}>每天只需確認一次：先看新 A級，再看已持有部位是否出現「賣出檢查」。系統只提醒，不會自動替你下單或賣出。</p></div><button style={{...primary,background:data?.summary?.reviewed?"#166534":"#0f766e"}} disabled={busy||!data?.tradeDate||Boolean(data?.summary?.reviewed)} onClick={()=>void reviewed()}>{data?.summary?.reviewed?"✓ 今日已檢查":"完成今日檢查"}</button></div></section>

    <section style={panel}><div style={sectionHead}><div><h2 style={{margin:0}}>我的 Swing10 部位與賣出提醒</h2><p style={muted}>測試與實際部位完全分開統計。紅色只代表「請檢查是否賣出」，不代表系統自動成交；單一 Decision 下滑或單日大盤高風險只會先進入黃色注意。</p></div><a href="/portfolio-manager" style={button}>前往投資組合管理</a></div>{alertRows.length?<PositionTable rows={alertRows}/>:<div style={empty}>目前沒有由 Swing10 A級建立的測試或實際部位。</div>}</section>

    <section style={panel}><div style={sectionHead}><div><h2 style={{margin:0}}>A1 / A0 機會｜A1可實買，A0建議先測試</h2><p style={muted}>A1 是跨日確認機會；A0 是新出現或只差一項軟條件的準A機會。A0 可先加入測試，實際買入只開放 A1。大盤風險另以「市場操作」提示，不再改掉股票本身的品質等級。</p></div></div>{aRows.length?<CandidateTable rows={aRows} onTrade={openTrade} testHeldSymbols={testHeldSymbols}/>:<div style={empty}>今日沒有 A1/A0 機會；下方仍保留「今日相對最佳 Top5」供觀察，不會為了湊A級而放寬風險紀律。</div>}</section>

    <section style={panel}><h2 style={{margin:0}}>今日相對最佳機會 Top5</h2><p style={muted}>即使 A1=0，仍顯示市場中相對最值得觀察的 5 檔；這是「相對排名」，不是強迫買進訊號。</p>{relativeTop5.length?<div style={{overflowX:"auto"}}><table style={table}><thead><tr>{["排名","股票","級別","Swing10","決策分","法人潛伏","發動","大盤風險","市場操作","外資續航","主要待改善"].map(x=><th key={x} style={th}>{x}</th>)}</tr></thead><tbody>{relativeTop5.map(r=><tr key={`rel-${r.symbol}`}><td style={td}>{r.rank}</td><td style={td}><a href={`/stock/${r.symbol}`} style={stock}>{r.symbol}</a> {r.stockName}</td><td style={{...td,color:gradeColor(r.grade),fontWeight:900}}>{r.grade}</td><td style={td}>{r.swing10Score.toFixed(1)}</td><td style={td}>{r.decisionScore.toFixed(1)}</td><td style={td}>{num(r.stealthScore)}</td><td style={td}>{num(r.triggerScore,0)}</td><td style={td}>{r.marketRiskLevel} {num(r.marketRiskScore,0)}</td><td style={td}>{r.marketPosture?.label??"—"}</td><td style={td}>{num(r.foreignPersistenceScore,0)}</td><td style={{...td,maxWidth:360,whiteSpace:"normal"}}>{r.reasons.filter(x=>x.startsWith("觀察：")||x.startsWith("待改善：")).slice(0,2).join("；")||"條件完整"}</td></tr>)}</tbody></table></div>:<div style={empty}>尚無相對機會資料。</div>}</section>

    <section style={panel}><div style={sectionHead}><div><h2 style={{margin:0}}>風險變化觀察</h2><p style={muted}>只列出大盤升風險、外資續航轉弱、當沖雜訊升高、融資籌碼轉弱或決策分明顯下降的候選。</p></div></div>{riskRows.length?<CandidateTable rows={riskRows}/>:<div style={empty}>今日前20名沒有重大負向風險變化。</div>}</section>

    <section style={panel}><div style={sectionHead}><div><h2 style={{margin:0}}>最近10個交易日 A級追蹤</h2><p style={muted}>曾進 A級、今天退出 A級的股票會明確標示。若同時已在持股中，請搭配上方賣出提醒判斷。</p></div></div><div style={{overflowX:"auto"}}><table style={table}><thead><tr>{["股票","首次A級","最近A級","A級天數","目前狀態"].map(x=><th key={x} style={th}>{x}</th>)}</tr></thead><tbody>{(data?.recentA??[]).map(r=><tr key={r.symbol}><td style={td}><a href={`/stock/${r.symbol}`} style={stock}>{r.symbol}</a> {r.stockName}</td><td style={td}>{r.firstADate}</td><td style={td}>{r.lastADate}</td><td style={td}>{r.aDays}</td><td style={{...td,color:r.currentA?"#4ade80":"#fbbf24",fontWeight:900}}>{r.status}</td></tr>)}{!(data?.recentA??[]).length&&<tr><td colSpan={5} style={td}>尚未累積 A級歷史；至少需要兩個交易日快照。</td></tr>}</tbody></table></div></section>

    <details style={details}><summary style={{cursor:"pointer",fontWeight:900}}>全部 Swing10 Top20</summary><div style={{marginTop:12}}><CandidateTable rows={rows}/></div></details>
  </div>
  {tradeRow&&<TradeModal row={tradeRow} mode={tradeMode} form={tradeForm} setForm={setTradeForm} busy={busy} close={()=>setTradeRow(null)} submit={()=>void createTrade()}/>} 
  </main>;
}

function CandidateTable({rows,onTrade,testHeldSymbols}:{rows:Row[];onTrade?:(row:Row,mode:TradeMode)=>void;testHeldSymbols?:ReadonlySet<string>}){
  const headers=["排名","股票","級別","Swing10","決策分 Δ1/3","法人潛伏","發動","大盤風險","市場操作","融資清洗","外資續航","當沖雜訊","排名Δ","風險變化",...(onTrade?["操作"]:[])];
  return <div style={{overflowX:"auto"}}><table style={table}><thead><tr>{headers.map(x=><th key={x} style={th}>{x}</th>)}</tr></thead><tbody>{rows.map(r=>{const testHeld=Boolean(testHeldSymbols?.has(r.symbol));return <tr key={`${r.tradeDate}-${r.symbol}`}><td style={td}>{r.rank}</td><td style={td}><a href={`/stock/${r.symbol}`} style={stock}>{r.symbol}</a> {r.stockName}</td><td style={{...td,color:gradeColor(r.grade),fontWeight:900}}>{r.grade}</td><td style={{...td,fontWeight:900}}>{r.swing10Score.toFixed(1)}</td><td style={td}>{r.decisionScore.toFixed(1)} <small style={{color:n(r.decisionDelta1d)>=0?"#4ade80":"#fb7185"}}>({signed(r.decisionDelta1d)} / {signed(r.decisionDelta3d)})</small></td><td style={td}>{r.stealthScore==null?"—":r.stealthScore.toFixed(1)}</td><td style={td}>{r.triggerScore==null?"—":r.triggerScore.toFixed(0)}</td><td style={td}>{r.marketRiskLevel} {r.marketRiskScore==null?"":r.marketRiskScore.toFixed(0)}</td><td style={td}>{r.marketPosture?.label??"—"}</td><td style={td}>{r.marginWashoutScore==null?"—":r.marginWashoutScore.toFixed(0)}</td><td style={td}>{r.foreignPersistenceScore==null?"—":r.foreignPersistenceScore.toFixed(0)}</td><td style={td}>{r.daytradeNoisePenalty==null?"—":`${r.daytradeRatioPct==null?"":`${r.daytradeRatioPct.toFixed(0)}% / `}-${r.daytradeNoisePenalty.toFixed(0)}`}</td><td style={td}>{r.rankDelta1d==null?"—":`${r.rankDelta1d>=0?"↑":"↓"}${Math.abs(r.rankDelta1d)}`}</td><td style={{...td,color:r.riskChangeLevel==="high"?"#fb7185":r.riskChangeLevel==="watch"?"#fbbf24":"#94a3b8",maxWidth:280,whiteSpace:"normal"}}>{r.riskChanges.join("、")}</td>{onTrade&&<td style={td}><div style={actions}><button style={testHeld?disabledTestButton:testButton} disabled={testHeld} aria-disabled={testHeld} title={testHeld?"此股票已建立 Swing10 測試部位":"加入 Swing10 測試部位"} onClick={()=>{if(!testHeld)onTrade(r,"test")}}>{testHeld?"✅ 已加入測試":"加入測試"}</button>{r.grade==="A1"?<button style={realButton} onClick={()=>onTrade(r,"real")}>實際買入</button>:<button style={disabledRealButton} disabled title="A0 建議先測試，跨日確認成 A1 後再實買">A0待確認</button>}</div></td>}</tr>})}</tbody></table></div>;
}

function PositionTable({rows}:{rows:TradePosition[]}){
  return <div style={{overflowX:"auto"}}><table style={table}><thead><tr>{["類型","股票","部位","成本 / 現價","目標 / 停損","報酬","持有日","進場→目前級別","Top20","決策分變化","外資續航","大盤","提醒","理由"].map(x=><th key={x} style={th}>{x}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.lotId}><td style={td}>{r.holdingType==="real"?"💰 實際":"🧪 測試"}</td><td style={td}><a href={`/stock/${r.symbol}`} style={stock}>{r.symbol}</a> {r.stockName}</td><td style={td}>{r.quantityLots.toFixed(3)} 張<br/><small style={{color:"#94a3b8"}}>約 {money(r.buyPrice*r.quantityLots*1000)} 元</small></td><td style={td}>{num(r.buyPrice,2)} → {num(r.currentPrice,2)}</td><td style={td}>{num(r.targetSellPrice,2)} / {num(r.buyPrice*(1+r.stopLossPct/100),2)}</td><td style={{...td,fontWeight:900,color:(r.returnPct??0)>=0?"#4ade80":"#fb7185"}}>{r.returnPct==null?"—":`${r.returnPct>=0?"+":""}${r.returnPct.toFixed(2)}%`}</td><td style={td}>{r.holdingDays}/{r.maxHoldingDays}</td><td style={td}>{r.entryGrade} → {r.currentGrade}</td><td style={td}>{r.currentRank==null?"OUT":`#${r.currentRank}`}</td><td style={td}>{num(r.entryDecisionScore)} → {num(r.currentDecisionScore)} ({signed(r.decisionChangeFromEntry)})</td><td style={td}>{num(r.foreignPersistenceScore,0)}</td><td style={td}>{r.marketRiskLevel} {num(r.marketRiskScore,0)}</td><td style={td}><AlertBadge action={r.action}/></td><td style={{...td,maxWidth:390,whiteSpace:"normal"}}>{r.reasons.length?r.reasons.join("；"):"條件穩定"}</td></tr>)}</tbody></table></div>;
}

function TradeModal({row,mode,form,setForm,busy,close,submit}:{row:Row;mode:TradeMode;form:{buyPrice:string;quantityLots:string;buyDate:string;takeProfitPct:string;stopLossPct:string;maxHoldingDays:string;note:string};setForm:(x:any)=>void;busy:boolean;close:()=>void;submit:()=>void}){
  const buy=n(form.buyPrice),tp=n(form.takeProfitPct),sl=n(form.stopLossPct);
  return <div style={overlay} onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><section style={modal}><div style={sectionHead}><div><h2 style={{margin:0}}>{mode==="test"?"🧪 加入 Swing10 測試":"💰 Swing10 實際買入"}</h2><p style={muted}>{row.symbol} {row.stockName}｜{row.grade}｜Swing10 {row.swing10Score.toFixed(1)}｜決策 {row.decisionScore.toFixed(1)}</p></div><button style={xButton} onClick={close}>×</button></div><div style={formGrid}><Field label="買進價" value={form.buyPrice} onChange={v=>setForm({...form,buyPrice:v})}/><Field label="張數（0.1=100股）" value={form.quantityLots} onChange={v=>setForm({...form,quantityLots:v})}/><Field label="買進日期" type="date" value={form.buyDate} onChange={v=>setForm({...form,buyDate:v})}/><Field label="停利 %" value={form.takeProfitPct} onChange={v=>setForm({...form,takeProfitPct:v})}/><Field label="停損 %" value={form.stopLossPct} onChange={v=>setForm({...form,stopLossPct:v})}/><Field label="最長持有交易日" value={form.maxHoldingDays} onChange={v=>setForm({...form,maxHoldingDays:v})}/><Field label="備註" type="text" value={form.note} onChange={v=>setForm({...form,note:v})}/></div><div style={previewBox}>策略預覽：目標價約 <b>{buy>0?num(buy*(1+tp/100),2):"—"}</b>｜停損價約 <b>{buy>0?num(buy*(1-sl/100),2):"—"}</b>｜第 {form.maxHoldingDays||10} 交易日進入 Time Stop。</div><p style={muted}>{mode==="test"?"測試部位預設不計手續費與稅，用來驗證選股勝率。":"實際部位會使用現有 Portfolio 手續費試算，正式成交仍以券商交割資料為準。"}</p><div style={actions}><button style={mode==="test"?testButton:realButton} disabled={busy} onClick={submit}>{busy?"儲存中…":mode==="test"?"確認加入測試":"確認實際買入"}</button><button style={button} onClick={close}>取消</button></div></section></div>;
}
function Field({label,value,onChange,type="number"}:{label:string;value:string;onChange:(v:string)=>void;type?:string}){return <label style={field}>{label}<input style={input} type={type} value={value} onChange={e=>onChange(e.target.value)}/></label>}
function Performance({title,perf}:{title:string;perf?:Perf}){return <section style={performanceCard}><h3 style={{margin:0}}>{title}</h3><div style={performanceItems}><Mini label="已結案" value={String(perf?.closedTrades??0)}/><Mini label="勝率" value={`${(perf?.winRatePct??0).toFixed(1)}%`}/><Mini label="平均報酬" value={`${(perf?.averageReturnPct??0)>=0?"+":""}${(perf?.averageReturnPct??0).toFixed(2)}%`}/><Mini label="平均持有" value={`${(perf?.averageHoldingDays??0).toFixed(1)}日`}/><Mini label="累計損益" value={`${money(perf?.totalProfit??0)}元`}/></div></section>}
function Mini({label,value}:{label:string;value:string}){return <div style={mini}><span style={{color:"#94a3b8"}}>{label}</span><b>{value}</b></div>}
function AlertBadge({action}:{action:TradePosition["action"]}){const spec=action==="sell_check"?["🔴 賣出檢查","#be123c"]:action==="watch"?["🟡 注意","#a16207"]:["🟢 續抱","#166534"];return <span style={{background:spec[1],color:"#fff",padding:"5px 8px",borderRadius:999,fontWeight:900}}>{spec[0]}</span>}
function Metric({label,value}:{label:string;value:string}){return <div style={metric}><div style={{color:"#94a3b8"}}>{label}</div><div style={{fontSize:24,fontWeight:900,marginTop:8}}>{value}</div></div>}
function gradeColor(g:string){return g==="A1"?"#4ade80":g==="A0"?"#22d3ee":g==="B+"?"#67e8f9":g==="B"?"#facc15":"#94a3b8";}
function actionRank(v:TradePosition["action"]){return v==="sell_check"?0:v==="watch"?1:2}

const main:React.CSSProperties={minHeight:"100vh",background:"#020617",color:"#e2e8f0",padding:"28px 20px 60px"};
const wrap:React.CSSProperties={maxWidth:1580,margin:"0 auto"};const header:React.CSSProperties={display:"flex",justifyContent:"space-between",gap:20,alignItems:"flex-start",flexWrap:"wrap"};const eye:React.CSSProperties={color:"#22d3ee",fontWeight:900,letterSpacing:.5};const muted:React.CSSProperties={color:"#94a3b8",lineHeight:1.7,margin:"6px 0 0"};const actions:React.CSSProperties={display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"};const primary:React.CSSProperties={border:0,borderRadius:10,background:"#0f766e",color:"#fff",padding:"11px 14px",fontWeight:900,cursor:"pointer"};const button:React.CSSProperties={...primary,background:"#1e293b",border:"1px solid #475569",textDecoration:"none"};const testButton:React.CSSProperties={...primary,background:"#1d4ed8",padding:"7px 10px"};const disabledTestButton:React.CSSProperties={...testButton,background:"#334155",color:"#cbd5e1",cursor:"default",opacity:.88};const realButton:React.CSSProperties={...primary,background:"#7c3aed",padding:"7px 10px"};const disabledRealButton:React.CSSProperties={...realButton,background:"#475569",color:"#cbd5e1",cursor:"default",opacity:.8};const messageBox:React.CSSProperties={marginTop:16,padding:12,border:"1px solid #0e7490",borderRadius:12,background:"#083344"};const cards:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(165px,1fr))",gap:12,marginTop:18};const metric:React.CSSProperties={background:"#0f172a",border:"1px solid #243244",borderRadius:14,padding:16};const panel:React.CSSProperties={marginTop:18,background:"#0f172a",border:"1px solid #243244",borderRadius:16,padding:18};const sectionHead:React.CSSProperties={display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"};const empty:React.CSSProperties={marginTop:14,padding:18,borderRadius:12,background:"#07111f",color:"#94a3b8"};const table:React.CSSProperties={width:"100%",borderCollapse:"collapse",marginTop:12};const th:React.CSSProperties={padding:"10px 8px",textAlign:"left",color:"#94a3b8",borderBottom:"1px solid #334155",whiteSpace:"nowrap",fontSize:12};const td:React.CSSProperties={padding:"10px 8px",borderBottom:"1px solid #1e293b",whiteSpace:"nowrap",fontSize:12};const stock:React.CSSProperties={color:"#67e8f9",fontWeight:900,textDecoration:"none"};const details:React.CSSProperties={...panel,padding:"14px 18px"};const performanceGrid:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(380px,1fr))",gap:12,marginTop:18};const performanceCard:React.CSSProperties={background:"#0f172a",border:"1px solid #334155",borderRadius:14,padding:16};const performanceItems:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(100px,1fr))",gap:8,marginTop:12};const mini:React.CSSProperties={display:"flex",flexDirection:"column",gap:5,background:"#020617",padding:10,borderRadius:9};const overlay:React.CSSProperties={position:"fixed",inset:0,zIndex:5000,background:"rgba(2,6,23,.82)",display:"grid",placeItems:"center",padding:16};const modal:React.CSSProperties={width:"min(820px,96vw)",maxHeight:"92vh",overflow:"auto",padding:20,border:"1px solid #475569",borderRadius:16,background:"#0f172a"};const xButton:React.CSSProperties={border:0,background:"transparent",color:"#fff",fontSize:28,cursor:"pointer"};const formGrid:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:12,marginTop:16};const field:React.CSSProperties={display:"flex",flexDirection:"column",gap:6,color:"#cbd5e1"};const input:React.CSSProperties={padding:"10px 11px",border:"1px solid #475569",borderRadius:8,background:"#020617",color:"#fff"};const previewBox:React.CSSProperties={marginTop:14,padding:12,borderRadius:10,background:"#082f49",border:"1px solid #0e7490"};
