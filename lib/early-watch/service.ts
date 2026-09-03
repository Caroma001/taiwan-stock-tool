import { randomUUID } from "node:crypto";
import { TursoDatabaseAdapter } from "@/adapters/turso";
import { getTursoClient } from "@/lib/turso";
import type { DatabaseAdapter, DatabaseRow } from "@/lib/database";
import { MigrationRunner } from "@/migrations/database/MigrationRunner";
import { tursoMigrations } from "@/migrations/turso";
import { scoreEarlyWatch, type EarlyWatchTier } from "@/lib/early-watch/scoring";

const VERSION="M8.11.8";
const SNAPSHOT_LIMIT=30;
const PREFILTER_LIMIT=160;
const TWSE_REVENUE_URL="https://mopsfin.twse.com.tw/opendata/t187ap05_L.csv";
const OTC_REVENUE_URL="https://mopsfin.twse.com.tw/opendata/t187ap05_O.csv";
const n=(v:unknown,fallback=0)=>Number.isFinite(Number(v))?Number(v):fallback;
const nullable=(v:unknown)=>v==null||v===""||!Number.isFinite(Number(v))?null:Number(v);
const text=(v:unknown)=>String(v??"").trim();
const marks=(count:number)=>Array.from({length:count},()=>"?").join(",");
const round=(v:number,d=1)=>Number(v.toFixed(d));

export type EarlyWatchRow={
  tradeDate:string; symbol:string; stockName:string; rank:number; tier:EarlyWatchTier;
  earlyWatchScore:number; fundamentalScore:number; catalystScore:number; priceNotPricedScore:number;
  accumulationScore:number; technicalSetupScore:number; revenueDataMonth:string|null; revenueYoyPct:number|null;
  revenueMomPct:number|null; revenueCumulativeYoyPct:number|null; revenueYoyAcceleration:number|null;
  price20Pct:number|null; foreign20:number|null; foreignBuyDays20:number|null; mutedPriceScore:number|null; foreignAccelerationScore:number|null; catalystCount:number;
  catalysts:Array<{id:string;eventDate:string;eventType:string;title:string;score:number}>;
  sourceConfidencePct:number; reasons:string[];
};

async function database(migrate=true){
  const db=new TursoDatabaseAdapter(getTursoClient());
  if(migrate) await new MigrationRunner(db,tursoMigrations).migrate();
  return db;
}

function rocMonth(value:unknown){
  const raw=text(value).replace(/[^0-9]/g,"");
  if(raw.length<5) return null;
  const year=Number(raw.slice(0,raw.length-2))+1911;
  const month=Number(raw.slice(-2));
  if(year<2000||month<1||month>12) return null;
  return `${year}-${String(month).padStart(2,"0")}`;
}

function parseCsv(textValue:string){
  const rows:string[][]=[];let row:string[]=[],cell="",quoted=false;
  for(let i=0;i<textValue.length;i++){const ch=textValue[i];
    if(ch==='"'){if(quoted&&textValue[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(ch===','&&!quoted){row.push(cell);cell="";}
    else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&textValue[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x!==""))rows.push(row);row=[];cell="";}
    else cell+=ch;
  }
  if(cell||row.length){row.push(cell);rows.push(row);}
  if(rows.length<2)return [] as Record<string,string>[];
  const headers=rows[0].map(x=>x.replace(/^\uFEFF/,"").trim());
  return rows.slice(1).map(values=>Object.fromEntries(headers.map((h,index)=>[h,(values[index]??"").trim()])));
}

async function fetchRevenueRows(url:string,market:string){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch(url,{cache:"no-store",signal:controller.signal,headers:{accept:"text/csv,application/json;q=0.9,*/*;q=0.5"}});
    if(!response.ok) throw new Error(`${market} 月營收 HTTP ${response.status}`);
    const contentType=response.headers.get("content-type")??"";
    const payload:Record<string,unknown>[]=contentType.includes("json")?await response.json():parseCsv(await response.text());
    if(!Array.isArray(payload)) throw new Error(`${market} 月營收格式錯誤`);
    return payload.map((row:Record<string,unknown>)=>({
      market,
      symbol:text(row["公司代號"]),stockName:text(row["公司名稱"]),industry:text(row["產業別"]),
      dataMonth:rocMonth(row["資料年月"]),
      currentRevenue:nullable(row["營業收入-當月營收"]),previousRevenue:nullable(row["營業收入-上月營收"]),lastYearRevenue:nullable(row["營業收入-去年當月營收"]),
      momPct:nullable(row["營業收入-上月比較增減(%)"]),yoyPct:nullable(row["營業收入-去年同月增減(%)"]),
      cumulativeRevenue:nullable(row["累計營業收入-當月累計營收"]),cumulativeLastYearRevenue:nullable(row["累計營業收入-去年累計營收"]),
      cumulativeYoyPct:nullable(row["累計營業收入-前期比較增減(%)"]),
    })).filter(row=>/^\d{4,6}$/.test(row.symbol)&&row.dataMonth);
  } finally {clearTimeout(timeout);}
}

async function refreshMonthlyRevenue(db:DatabaseAdapter){
  const settled=await Promise.allSettled([
    fetchRevenueRows(TWSE_REVENUE_URL,"listed"),
    fetchRevenueRows(OTC_REVENUE_URL,"otc"),
  ]);
  const rows=settled.flatMap(result=>result.status==="fulfilled"?result.value:[]);
  if(!rows.length){
    const errors=settled.filter(x=>x.status==="rejected").map(x=>x.status==="rejected"?String(x.reason):"");
    throw new Error(`官方月營收暫時無法取得：${errors.join("；")}`);
  }
  const latestMonth=rows.map(r=>r.dataMonth??"").sort().at(-1)??null;
  const latestRows=latestMonth?rows.filter(r=>r.dataMonth===latestMonth):rows;
  const existing=latestMonth?await db.execute<DatabaseRow>({sql:"SELECT COUNT(*) AS c FROM monthly_revenue_history WHERE data_month=?",args:[latestMonth]}):null;
  const existingCount=n(existing?.rows[0]?.c);
  if(existingCount!==latestRows.length){
    const now=new Date().toISOString();
    await db.executeMany(latestRows.map(r=>({
      sql:`INSERT INTO monthly_revenue_history(symbol,data_month,stock_name,market,industry,current_revenue,previous_month_revenue,last_year_revenue,mom_pct,yoy_pct,cumulative_revenue,cumulative_last_year_revenue,cumulative_yoy_pct,source,fetched_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(symbol,data_month) DO UPDATE SET stock_name=excluded.stock_name,market=excluded.market,industry=excluded.industry,current_revenue=excluded.current_revenue,previous_month_revenue=excluded.previous_month_revenue,last_year_revenue=excluded.last_year_revenue,mom_pct=excluded.mom_pct,yoy_pct=excluded.yoy_pct,cumulative_revenue=excluded.cumulative_revenue,cumulative_last_year_revenue=excluded.cumulative_last_year_revenue,cumulative_yoy_pct=excluded.cumulative_yoy_pct,source=excluded.source,fetched_at=excluded.fetched_at`,
      args:[r.symbol,r.dataMonth,r.stockName,r.market,r.industry,r.currentRevenue,r.previousRevenue,r.lastYearRevenue,r.momPct,r.yoyPct,r.cumulativeRevenue,r.cumulativeLastYearRevenue,r.cumulativeYoyPct,"TWSE/MOPS Open Data",now],
    })));
  }
  return {dataMonth:latestMonth,rows:latestRows.length,externalRequests:2,sourceStatus:settled.map((r,i)=>({market:i===0?"listed":"otc",ok:r.status==="fulfilled"}))};
}

async function candidateUniverse(db:DatabaseAdapter,dataMonth:string|null){
  const symbols=new Set<string>();
  if(dataMonth){
    const revenue=await db.execute<DatabaseRow>({
      sql:`SELECT symbol FROM monthly_revenue_history WHERE data_month=? AND yoy_pct IS NOT NULL
           ORDER BY (
             MIN(MAX(COALESCE(yoy_pct,0),0),150)*0.55
             + MIN(MAX(COALESCE(cumulative_yoy_pct,0),0),100)*0.35
             + MIN(MAX(COALESCE(mom_pct,0),0),50)*0.10
           ) DESC LIMIT ${PREFILTER_LIMIT}`,
      args:[dataMonth],
    });
    for(const row of revenue.rows) symbols.add(text(row.symbol));
  }
  const foreign=await db.execute<DatabaseRow>({
    sql:`SELECT symbol FROM foreign_accumulation_latest ORDER BY accumulation_score DESC,buy_days_20 DESC LIMIT ${PREFILTER_LIMIT}`,
  });
  for(const row of foreign.rows) symbols.add(text(row.symbol));
  return [...symbols].filter(Boolean).slice(0,PREFILTER_LIMIT*2);
}

async function priorRevenueMap(db:DatabaseAdapter,symbols:string[],dataMonth:string|null){
  const map=new Map<string,DatabaseRow>();
  if(!symbols.length||!dataMonth) return map;
  const result=await db.execute<DatabaseRow>({
    sql:`SELECT symbol,data_month,yoy_pct,current_revenue,previous_month_revenue,last_year_revenue FROM monthly_revenue_history
         WHERE data_month<? AND symbol IN (${marks(symbols.length)}) ORDER BY data_month DESC`,
    args:[dataMonth,...symbols],
  });
  for(const row of result.rows){const symbol=text(row.symbol);if(symbol&&!map.has(symbol))map.set(symbol,row);}
  return map;
}

async function catalystsBySymbol(db:DatabaseAdapter,symbols:string[],tradeDate:string){
  const map=new Map<string,Array<{id:string;eventDate:string;eventType:string;title:string;score:number}>>();
  if(!symbols.length) return map;
  const result=await db.execute<DatabaseRow>({
    sql:`SELECT id,symbol,event_date,event_type,title,score FROM early_watch_catalyst_events
         WHERE symbol IN (${marks(symbols.length)}) AND event_date<=? AND (active_until IS NULL OR active_until>=?)
         ORDER BY event_date DESC`,
    args:[...symbols,tradeDate,tradeDate],
  });
  for(const row of result.rows){
    const symbol=text(row.symbol); if(!symbol) continue;
    const list=map.get(symbol)??[];
    list.push({id:text(row.id),eventDate:text(row.event_date),eventType:text(row.event_type),title:text(row.title),score:n(row.score)});
    map.set(symbol,list.slice(0,5));
  }
  return map;
}

export async function refreshEarlyWatch(db:DatabaseAdapter,tradeDate:string){
  const startedAt=new Date().toISOString();
  await db.execute({sql:`INSERT INTO early_watch_refresh_runs(trade_date,status,updated_at,started_at) VALUES(?,'running',?,?) ON CONFLICT(trade_date) DO UPDATE SET status='running',last_error=NULL,updated_at=excluded.updated_at,started_at=COALESCE(early_watch_refresh_runs.started_at,excluded.started_at)`,args:[tradeDate,startedAt,startedAt]});
  let revenue:{dataMonth:string|null;rows:number;externalRequests:number;sourceStatus:Array<{market:string;ok:boolean}>}|null=null;
  try{
    revenue=await refreshMonthlyRevenue(db);
  }catch(error){
    const latest=await db.execute<DatabaseRow>({sql:"SELECT MAX(data_month) AS m FROM monthly_revenue_history"});
    revenue={dataMonth:text(latest.rows[0]?.m)||null,rows:0,externalRequests:2,sourceStatus:[]};
  }
  const symbols=await candidateUniverse(db,revenue.dataMonth);
  if(!symbols.length) return {ok:true,version:VERSION,tradeDate,total:0,rows:[] as EarlyWatchRow[],revenue};
  const current=await db.execute<DatabaseRow>({
    sql:`SELECT s.symbol,s.name AS stock_name,r.data_month,r.current_revenue,r.previous_month_revenue,r.last_year_revenue,r.yoy_pct,r.mom_pct,r.cumulative_yoy_pct,
                f.accumulation_score,f.muted_price_score,f.acceleration_score AS foreign_acceleration_score,f.buy_days_20,f.price_20_pct,f.foreign_20,
                i.close,i.ma20,i.ma60
         FROM stocks s
         LEFT JOIN monthly_revenue_history r ON r.symbol=s.symbol AND r.data_month=?
         LEFT JOIN foreign_accumulation_latest f ON f.symbol=s.symbol
         LEFT JOIN indicator_latest i ON i.symbol=s.symbol
         WHERE s.symbol IN (${marks(symbols.length)})`,
    args:[revenue.dataMonth??"",...symbols],
  });
  const previousRevenue=await priorRevenueMap(db,symbols,revenue.dataMonth);
  const catalysts=await catalystsBySymbol(db,symbols,tradeDate);
  const scored=current.rows.map(row=>{
    const symbol=text(row.symbol),events=catalysts.get(symbol)??[];
    const yoy=nullable(row.yoy_pct),prevYoy=nullable(previousRevenue.get(symbol)?.yoy_pct);
    const catalystScore=Math.min(20,events.reduce((sum,event)=>sum+event.score,0));
    const score=scoreEarlyWatch({
      revenueYoyPct:yoy,revenueMomPct:nullable(row.mom_pct),revenueCumulativeYoyPct:nullable(row.cumulative_yoy_pct),revenueYoyAcceleration:yoy!=null&&prevYoy!=null?round(yoy-prevYoy,1):null,
      priorRevenueYoyPct:prevYoy,currentRevenue:nullable(row.current_revenue),previousMonthRevenue:nullable(row.previous_month_revenue),lastYearRevenue:nullable(row.last_year_revenue),
      accumulationScore:nullable(row.accumulation_score),mutedPriceScore:nullable(row.muted_price_score),foreignAccelerationScore:nullable(row.foreign_acceleration_score),buyDays20:nullable(row.buy_days_20),price20Pct:nullable(row.price_20_pct),
      close:nullable(row.close),ma20:nullable(row.ma20),ma60:nullable(row.ma60),catalystScore,catalystCount:events.length,
    });
    return {
      tradeDate,symbol,stockName:text(row.stock_name)||symbol,rank:0,tier:score.tier,earlyWatchScore:score.score,
      fundamentalScore:score.fundamentalScore,catalystScore:score.catalystScore,priceNotPricedScore:score.priceNotPricedScore,accumulationScore:score.accumulationScore,technicalSetupScore:score.technicalSetupScore,
      revenueDataMonth:revenue.dataMonth,revenueYoyPct:yoy,revenueMomPct:nullable(row.mom_pct),revenueCumulativeYoyPct:nullable(row.cumulative_yoy_pct),revenueYoyAcceleration:yoy!=null&&prevYoy!=null?round(yoy-prevYoy,1):null,
      price20Pct:nullable(row.price_20_pct),foreign20:nullable(row.foreign_20),foreignBuyDays20:nullable(row.buy_days_20),mutedPriceScore:nullable(row.muted_price_score),foreignAccelerationScore:nullable(row.foreign_acceleration_score),catalystCount:events.length,catalysts:events,sourceConfidencePct:score.sourceConfidencePct,reasons:score.reasons,
    } satisfies EarlyWatchRow;
  }).filter(row=>row.tier!=="PASS").sort((a,b)=>b.earlyWatchScore-a.earlyWatchScore).slice(0,SNAPSHOT_LIMIT).map((row,index)=>({...row,rank:index+1}));
  const now=new Date().toISOString();
  await db.executeMany([{sql:"DELETE FROM early_watch_daily WHERE trade_date=?",args:[tradeDate]},...scored.map(row=>({
    sql:`INSERT INTO early_watch_daily(trade_date,symbol,stock_name,candidate_rank,tier,early_watch_score,fundamental_score,catalyst_score,price_not_priced_score,accumulation_score,technical_setup_score,revenue_data_month,revenue_yoy_pct,revenue_mom_pct,revenue_cumulative_yoy_pct,revenue_yoy_acceleration,price_20_pct,foreign_20,foreign_buy_days_20,muted_price_score,foreign_acceleration_score,catalyst_count,catalyst_json,reasons_json,source_confidence_pct,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args:[row.tradeDate,row.symbol,row.stockName,row.rank,row.tier,row.earlyWatchScore,row.fundamentalScore,row.catalystScore,row.priceNotPricedScore,row.accumulationScore,row.technicalSetupScore,row.revenueDataMonth,row.revenueYoyPct,row.revenueMomPct,row.revenueCumulativeYoyPct,row.revenueYoyAcceleration,row.price20Pct,row.foreign20,row.foreignBuyDays20,row.mutedPriceScore,row.foreignAccelerationScore,row.catalystCount,JSON.stringify(row.catalysts),JSON.stringify(row.reasons),row.sourceConfidencePct,now,now],
  }))]);
  await db.execute({sql:`UPDATE early_watch_refresh_runs SET status='completed',revenue_data_month=?,revenue_rows=?,candidate_rows=?,external_requests=?,source_json=?,last_error=NULL,completed_at=?,updated_at=? WHERE trade_date=?`,args:[revenue.dataMonth,revenue.rows,scored.length,revenue.externalRequests,JSON.stringify(revenue.sourceStatus),now,now,tradeDate]});
  return {ok:true,version:VERSION,tradeDate,total:scored.length,strongCount:scored.filter(r=>r.tier==="EW-A").length,watchCount:scored.filter(r=>r.tier==="EW-A"||r.tier==="EW-B").length,rows:scored,revenue};
}

function parseArray<T>(value:unknown):T[]{try{const p=JSON.parse(text(value)||"[]");return Array.isArray(p)?p:[];}catch{return [];}}

export async function readEarlyWatchDashboard(){
  const db=await database(true);
  const latest=await db.execute<DatabaseRow>({sql:"SELECT MAX(trade_date) AS d FROM early_watch_daily"});
  const tradeDate=text(latest.rows[0]?.d)||null;
  if(!tradeDate) return {ok:true,version:VERSION,tradeDate:null,summary:{total:0,strong:0,watch:0,revenueMonth:null},rows:[] as EarlyWatchRow[]};
  const [rowsResult,run]=await Promise.all([
    db.execute<DatabaseRow>({sql:"SELECT * FROM early_watch_daily WHERE trade_date=? ORDER BY candidate_rank LIMIT 30",args:[tradeDate]}),
    db.execute<DatabaseRow>({sql:"SELECT * FROM early_watch_refresh_runs WHERE trade_date=? LIMIT 1",args:[tradeDate]}),
  ]);
  const rows=rowsResult.rows.map(row=>({
    tradeDate:text(row.trade_date),symbol:text(row.symbol),stockName:text(row.stock_name),rank:n(row.candidate_rank),tier:text(row.tier) as EarlyWatchTier,earlyWatchScore:n(row.early_watch_score),fundamentalScore:n(row.fundamental_score),catalystScore:n(row.catalyst_score),priceNotPricedScore:n(row.price_not_priced_score),accumulationScore:n(row.accumulation_score),technicalSetupScore:n(row.technical_setup_score),revenueDataMonth:text(row.revenue_data_month)||null,revenueYoyPct:nullable(row.revenue_yoy_pct),revenueMomPct:nullable(row.revenue_mom_pct),revenueCumulativeYoyPct:nullable(row.revenue_cumulative_yoy_pct),revenueYoyAcceleration:nullable(row.revenue_yoy_acceleration),price20Pct:nullable(row.price_20_pct),foreign20:nullable(row.foreign_20),foreignBuyDays20:nullable(row.foreign_buy_days_20),mutedPriceScore:nullable(row.muted_price_score),foreignAccelerationScore:nullable(row.foreign_acceleration_score),catalystCount:n(row.catalyst_count),catalysts:parseArray<{id:string;eventDate:string;eventType:string;title:string;score:number}>(row.catalyst_json),sourceConfidencePct:n(row.source_confidence_pct),reasons:parseArray<string>(row.reasons_json),
  })) satisfies EarlyWatchRow[];
  return {ok:true,version:VERSION,tradeDate,summary:{total:rows.length,strong:rows.filter(r=>r.tier==="EW-A").length,watch:rows.filter(r=>r.tier==="EW-A"||r.tier==="EW-B").length,revenueMonth:text(run.rows[0]?.revenue_data_month)||null,externalRequests:n(run.rows[0]?.external_requests)},rows};
}

export async function refreshEarlyWatchWithMigration(tradeDate?:string){
  const db=await database(true);
  let date=tradeDate;
  if(!date){const result=await db.execute<DatabaseRow>({sql:"SELECT MAX(trade_date) AS d FROM foreign_accumulation_latest"});date=text(result.rows[0]?.d);}
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date??"")) throw new Error("找不到有效交易日，請先完成每日一鍵更新。");
  return refreshEarlyWatch(db,date!);
}

const eventWeights:Record<string,number>={buyback:20,contract:18,earnings:16,conference:10,expansion:12,subsidiary:8,customer:14,other:6};
export async function upsertCatalystEvent(input:{symbol:string;eventDate:string;eventType:string;title:string;score?:number;sourceUrl?:string;note?:string;activeUntil?:string}){
  const db=await database(true);
  const symbol=text(input.symbol),eventDate=text(input.eventDate),eventType=text(input.eventType)||"other",title=text(input.title);
  if(!/^\d{4,6}$/.test(symbol)) throw new Error("股票代號格式不正確");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) throw new Error("事件日期格式不正確");
  if(!title) throw new Error("請輸入事件標題");
  const id=randomUUID(),now=new Date().toISOString(),score=round(Math.max(0,Math.min(20,input.score??eventWeights[eventType]??6)),1);
  await db.execute({sql:`INSERT INTO early_watch_catalyst_events(id,symbol,event_date,event_type,title,score,source_url,note,active_until,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,args:[id,symbol,eventDate,eventType,title,score,text(input.sourceUrl)||null,text(input.note)||null,text(input.activeUntil)||null,now,now]});
  return {ok:true,id,symbol,eventDate,eventType,title,score};
}

export async function removeCatalystEvent(id:string){
  const db=await database(true);
  const result=await db.execute({sql:"DELETE FROM early_watch_catalyst_events WHERE id=?",args:[text(id)]});
  return {ok:true,removed:result.rowsAffected};
}
