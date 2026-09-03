import { randomUUID } from "node:crypto";
import type { DatabaseAdapter, DatabaseRow, DatabaseStatement } from "@/lib/database";
import { fetchPublicRiskSnapshot, type PublicRiskSnapshot } from "@/lib/risk-intelligence/public-data";

const ENGINE_VERSION = "M8.10.25";
const SNAPSHOT_RETRY_GUARD_MS = 10 * 60_000;
const SNAPSHOT_LEASE_MS = 90_000;
const MICROSTRUCTURE_RETENTION_DAYS = 60;
const clamp = (value:number, min=0, max=100) => Math.min(max, Math.max(min, value));
const round = (value:number, digits=1) => Number(value.toFixed(digits));
const numeric = (value:unknown):number|null => value == null || !Number.isFinite(Number(value)) ? null : Number(value);
const marks = (count:number) => Array.from({length:count},()=>"?").join(",");

function parseJsonObject(value:unknown):Record<string,unknown>{
  try {
    const parsed=JSON.parse(String(value??"{}"));
    return parsed && typeof parsed==="object" && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

function parseJsonArray(value:unknown):string[]{
  try {
    const parsed=JSON.parse(String(value??"[]"));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch { return []; }
}

function isoDateDaysBefore(date:string, days:number){
  const parsed=new Date(`${date}T12:00:00+08:00`);
  parsed.setUTCDate(parsed.getUTCDate()-days);
  return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(parsed);
}

async function executeManyChunked(db:DatabaseAdapter, statements:DatabaseStatement[], chunkSize=180){
  for(let i=0;i<statements.length;i+=chunkSize){
    await db.executeMany(statements.slice(i,i+chunkSize));
  }
}

export type MarketRiskInput={
  globalMarketScore?:number|null;
  taiexCloses?:number[];
  taiexChangePct?:number|null;
};
export type MarketRiskResult={
  score:number;
  level:"低"|"中低"|"中高"|"高";
  modifier:number;
  reasons:string[];
};

export function calculateMarketRisk(input:MarketRiskInput):MarketRiskResult{
  const closes=(input.taiexCloses??[]).filter(Number.isFinite);
  const current=closes.at(-1)??null;
  const prev5=closes.length>=6?closes.at(-6)??null:null;
  const recent20=closes.slice(-20);
  const ma20=recent20.length>=10 ? recent20.reduce((a,b)=>a+b,0)/recent20.length : null;
  const high20=recent20.length?Math.max(...recent20):null;
  const ret5=current!=null&&prev5?((current/prev5)-1)*100:null;
  const drawdown20=current!=null&&high20?((current/high20)-1)*100:null;
  const closeVsMa20=current!=null&&ma20?((current/ma20)-1)*100:null;
  const dayChange=input.taiexChangePct??null;
  const globalRisk=input.globalMarketScore==null?50:100-clamp(input.globalMarketScore);

  let technicalRisk=50;
  if(ret5!=null) technicalRisk += clamp(-ret5*7,-25,35);
  if(drawdown20!=null) technicalRisk += clamp(-drawdown20*4,0,35);
  if(closeVsMa20!=null) technicalRisk += closeVsMa20<0 ? clamp(-closeVsMa20*5,0,25) : -Math.min(10,closeVsMa20*2);
  if(dayChange!=null) technicalRisk += clamp(-dayChange*5,-12,20);
  technicalRisk=clamp(technicalRisk);

  const hasHistory=ret5!=null || drawdown20!=null || closeVsMa20!=null;
  const score=round(clamp(hasHistory?globalRisk*.45+technicalRisk*.55:globalRisk*.70+technicalRisk*.30),1);
  const level:MarketRiskResult["level"]=score>=72?"高":score>=55?"中高":score>=35?"中低":"低";
  const modifier=score>=82?-12:score>=72?-8:score>=60?-5:score>=48?-2:score<=24?2:score<=34?1:0;
  const reasons=[
    `全球市場風險 ${round(globalRisk,0)}/100`,
    dayChange==null?"TAIEX 當日漲跌待補":`TAIEX 當日 ${dayChange>=0?"+":""}${round(dayChange,2)}%`,
    ret5==null?"TAIEX 5日趨勢累積中":`TAIEX 5日 ${ret5>=0?"+":""}${round(ret5,2)}%`,
    drawdown20==null?"TAIEX 20日回撤累積中":`TAIEX 20日回撤 ${round(drawdown20,2)}%`,
  ];
  return {score,level,modifier,reasons};
}

export type MarginWashoutInput={
  balances:Array<number|null>;
  currentPrevBalance?:number|null;
  price5Pct?:number|null;
  foreign5?:number|null;
};
export type MarginWashoutResult={score:number|null;change1dPct:number|null;change5dPct:number|null;change10dPct:number|null;modifier:number;reasons:string[]};
function changePct(latest:number|null, past:number|null){
  if(latest==null||past==null||Math.abs(past)<1e-9) return null;
  return ((latest-past)/Math.abs(past))*100;
}
export function calculateMarginWashout(input:MarginWashoutInput):MarginWashoutResult{
  const balances=input.balances.filter((v):v is number=>v!=null&&Number.isFinite(v));
  if(!balances.length) return {score:null,change1dPct:null,change5dPct:null,change10dPct:null,modifier:0,reasons:["融資資料待累積"]};
  const latest=balances.at(-1)??null;
  const ch1=changePct(latest,balances.length>=2?balances.at(-2)??null:(input.currentPrevBalance??null));
  const ch5=changePct(latest,balances.length>=6?balances.at(-6)??null:null);
  const ch10=changePct(latest,balances.length>=11?balances.at(-11)??null:null);
  let score=50;
  const wash=ch5??ch1;
  if(wash!=null){
    if(wash<=-12) score+=28;
    else if(wash<=-6) score+=20;
    else if(wash<=-2) score+=10;
    else if(wash>=15) score-=25;
    else if(wash>=8) score-=15;
    else if(wash>=3) score-=7;
  }
  if(ch10!=null){ if(ch10<=-10) score+=8; else if(ch10>=12) score-=8; }
  if((input.foreign5??0)>0 && (wash??0)<0) score+=10;
  if((input.price5Pct??0)>=-3 && (wash??0)<=-2) score+=8;
  // Margin contraction during a price collapse is often forced liquidation,
  // not healthy retail washout. Do not reward it as a bullish signal.
  if((input.price5Pct??0)<=-8 && (wash??0)<=-8) score=Math.min(score,35);
  if((input.price5Pct??0)>=7 && (wash??0)>=8) score=Math.min(score,28);
  score=round(clamp(score),1);
  const modifier=score>=78?4:score>=64?2:score<=30?-3:score<=42?-1:0;
  const reasons=[
    ch1==null?"融資1日變化待補":`融資1日 ${ch1>=0?"+":""}${round(ch1,1)}%`,
    ch5==null?"融資5日變化累積中":`融資5日 ${ch5>=0?"+":""}${round(ch5,1)}%`,
    (input.price5Pct??0)<=-8 && (wash??0)<=-8?"價格急跌伴隨融資下降：視為斷頭風險，不算健康清洗":"融資清洗與價格結構交叉判斷",
  ];
  return {score,change1dPct:ch1==null?null:round(ch1,2),change5dPct:ch5==null?null:round(ch5,2),change10dPct:ch10==null?null:round(ch10,2),modifier,reasons};
}

export type ForeignPersistenceInput={foreign5?:number|null;foreign10?:number|null;foreign20?:number|null;buyDays5?:number|null;buyDays20?:number|null;todayNet?:number|null};
export type ForeignPersistenceResult={score:number|null;oneDayShare5Pct:number|null;modifier:number;reasons:string[]};
export function calculateForeignPersistence(input:ForeignPersistenceInput):ForeignPersistenceResult{
  const f5=input.foreign5??null, f10=input.foreign10??null, f20=input.foreign20??null;
  if(f5==null&&f10==null&&f20==null) return {score:null,oneDayShare5Pct:null,modifier:0,reasons:["外資5/10/20日資料不足"]};
  let score=30;
  if((f5??0)>0) score+=18; else score-=12;
  if((f10??0)>0) score+=16; else score-=8;
  if((f20??0)>0) score+=14; else score-=8;
  const days5=Math.max(0,Number(input.buyDays5??0));
  const days20=Math.max(0,Number(input.buyDays20??0));
  score+=clamp((days5/5)*16,0,16);
  score+=clamp((days20/20)*12,0,12);
  const today=input.todayNet??null;
  const share=today!=null&&f5!=null&&Math.abs(f5)>1e-9 ? Math.abs(today)/Math.abs(f5)*100 : null;
  if(share!=null && share>=70 && days5<=2) score-=24;
  else if(share!=null && share>=55 && days5<=3) score-=12;
  if((f5??0)>0&&(f10??0)>0&&(f20??0)>0&&days5>=3) score+=8;
  score=round(clamp(score),1);
  const modifier=score>=82?4:score>=67?2:score<=28?-4:score<=42?-2:0;
  return {
    score,
    oneDayShare5Pct:share==null?null:round(share,1),
    modifier,
    reasons:[
      `外資買超天數 5日 ${days5}/5、20日 ${days20}/20`,
      share==null?"單日占5日買超比待補":`單日占5日外資量 ${round(share,1)}%`,
      share!=null&&share>=70&&days5<=2?"單日外資占比偏高：短線/隔日沖雜訊風險":"外資續航以5/10/20日一致性為主",
    ],
  };
}

export type DaytradeNoiseInput={daytradeVolume?:number|null;marketVolume?:number|null;foreignOneDayShare5Pct?:number|null};
export type DaytradeNoiseResult={ratioPct:number|null;penalty:number;reasons:string[]};
export function calculateDaytradeNoise(input:DaytradeNoiseInput):DaytradeNoiseResult{
  const day=input.daytradeVolume??null, vol=input.marketVolume??null;
  if(day==null||vol==null||vol<=0) return {ratioPct:null,penalty:0,reasons:["當沖比資料待補，不扣分"]};
  const ratio=clamp((day/vol)*100,0,100);
  let penalty=ratio>=70?10:ratio>=50?7:ratio>=35?4:ratio>=25?2:0;
  if((input.foreignOneDayShare5Pct??0)>=60 && ratio>=35) penalty+=2;
  penalty=Math.min(12,penalty);
  return {ratioPct:round(ratio,1),penalty,reasons:[`當沖比 ${round(ratio,1)}%`,penalty>=7?"短線籌碼噪音偏高":penalty>0?"當沖熱度略高":"當沖噪音低"]};
}

export function betaProxyFromVolatility(volatility20Pct:number|null|undefined){
  if(volatility20Pct==null||!Number.isFinite(volatility20Pct)) return 1;
  return round(clamp(.85+(volatility20Pct-1.5)*.12,.8,1.35),2);
}

export function combineDecisionOverlay(input:{basePotential:number;market:MarketRiskResult;betaProxy:number;margin:MarginWashoutResult;foreign:ForeignPersistenceResult;daytrade:DaytradeNoiseResult}){
  const marketModifier=input.market.modifier<0 ? input.market.modifier*input.betaProxy : input.market.modifier;
  const raw=marketModifier+input.margin.modifier+input.foreign.modifier-input.daytrade.penalty;
  const modifier=round(clamp(raw,-15,8),1);
  return {modifier,decisionScore:round(clamp(input.basePotential+modifier),1),marketModifier:round(marketModifier,1)};
}

function snapshotFromRow(row:DatabaseRow|undefined){
  return row?{
    status:String(row.status??"waiting"),marginRows:Number(row.margin_rows??0),daytradeRows:Number(row.daytrade_rows??0),indexRows:Number(row.index_rows??0),
    externalRequests:Number(row.external_requests??0),successfulRequests:Number(row.successful_requests??0),sources:parseJsonObject(row.source_json),lastError:row.last_error==null?null:String(row.last_error),
    updatedAt:row.updated_at==null?null:String(row.updated_at),completedAt:row.completed_at==null?null:String(row.completed_at),
  }:null;
}

/** Fetch each official daily dataset at most once per trading date. */
export async function ensurePublicRiskSnapshot(db:DatabaseAdapter, tradeDate:string, persistSymbols?:string[]){
  const existing=(await db.execute<DatabaseRow>({sql:"SELECT * FROM public_risk_snapshot_runs WHERE trade_date=? LIMIT 1",args:[tradeDate]})).rows[0];
  if(String(existing?.status??"")==="completed") return {cached:true,...snapshotFromRow(existing)};
  const updatedMs=existing?.updated_at?Date.parse(String(existing.updated_at)):0;
  if(String(existing?.status??"")==="failed"&&updatedMs&&Date.now()-updatedMs<SNAPSHOT_RETRY_GUARD_MS) return {cached:true,...snapshotFromRow(existing)};

  const now=new Date();
  const nowIso=now.toISOString();
  const token=randomUUID();
  const leaseUntil=new Date(now.getTime()+SNAPSHOT_LEASE_MS).toISOString();
  await db.execute({sql:`INSERT OR IGNORE INTO public_risk_snapshot_runs(trade_date,status,engine_version,updated_at) VALUES(?,?,?,?)`,args:[tradeDate,"waiting",ENGINE_VERSION,nowIso]});
  const lease=await db.execute({
    sql:`UPDATE public_risk_snapshot_runs SET status='running',engine_version=?,lease_token=?,lease_until=?,started_at=COALESCE(started_at,?),updated_at=?
      WHERE trade_date=? AND status<>'completed' AND (lease_until IS NULL OR lease_until<=?)`,
    args:[ENGINE_VERSION,token,leaseUntil,nowIso,nowIso,tradeDate,nowIso],
  });
  if(lease.rowsAffected===0){
    const row=(await db.execute<DatabaseRow>({sql:"SELECT * FROM public_risk_snapshot_runs WHERE trade_date=? LIMIT 1",args:[tradeDate]})).rows[0];
    return {cached:true,inProgress:true,...snapshotFromRow(row)};
  }

  let snapshot:PublicRiskSnapshot|null=null;
  try {
    snapshot=await fetchPublicRiskSnapshot(tradeDate);
    const keep=persistSymbols?.length?new Set(persistSymbols.map(String)):null;
    const marginMap=new Map(snapshot.marginRows.filter(row=>!keep||keep.has(row.symbol)).map(row=>[row.symbol,row]));
    const dayMap=new Map(snapshot.daytradeRows.filter(row=>!keep||keep.has(row.symbol)).map(row=>[row.symbol,row]));
    // M8.10.25 Turso budget: official endpoints are market-wide Bulk, but only
    // the current Top40 universe is persisted. This keeps daily writes near
    // dozens of rows instead of ~2,000 while 5/10-day margin history builds
    // naturally for names that remain in the candidate pool.
    const symbols=[...new Set([...marginMap.keys(),...dayMap.keys()])];
    const writeAt=new Date().toISOString();
    const statements:DatabaseStatement[]=symbols.map(symbol=>{
      const m=marginMap.get(symbol), d=dayMap.get(symbol);
      return {sql:`INSERT INTO market_microstructure_daily(
        symbol,trade_date,margin_prev_balance,margin_buy,margin_sell,margin_cash_repay,margin_balance,margin_utilization_pct,
        short_prev_balance,short_sell,short_buy,short_repay,short_balance,daytrade_volume,daytrade_buy_value,daytrade_sell_value,margin_source,daytrade_source,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(symbol,trade_date) DO UPDATE SET
        margin_prev_balance=COALESCE(excluded.margin_prev_balance,market_microstructure_daily.margin_prev_balance),
        margin_buy=COALESCE(excluded.margin_buy,market_microstructure_daily.margin_buy),margin_sell=COALESCE(excluded.margin_sell,market_microstructure_daily.margin_sell),
        margin_cash_repay=COALESCE(excluded.margin_cash_repay,market_microstructure_daily.margin_cash_repay),margin_balance=COALESCE(excluded.margin_balance,market_microstructure_daily.margin_balance),
        margin_utilization_pct=COALESCE(excluded.margin_utilization_pct,market_microstructure_daily.margin_utilization_pct),short_prev_balance=COALESCE(excluded.short_prev_balance,market_microstructure_daily.short_prev_balance),
        short_sell=COALESCE(excluded.short_sell,market_microstructure_daily.short_sell),short_buy=COALESCE(excluded.short_buy,market_microstructure_daily.short_buy),short_repay=COALESCE(excluded.short_repay,market_microstructure_daily.short_repay),short_balance=COALESCE(excluded.short_balance,market_microstructure_daily.short_balance),
        daytrade_volume=COALESCE(excluded.daytrade_volume,market_microstructure_daily.daytrade_volume),daytrade_buy_value=COALESCE(excluded.daytrade_buy_value,market_microstructure_daily.daytrade_buy_value),daytrade_sell_value=COALESCE(excluded.daytrade_sell_value,market_microstructure_daily.daytrade_sell_value),
        margin_source=COALESCE(excluded.margin_source,market_microstructure_daily.margin_source),daytrade_source=COALESCE(excluded.daytrade_source,market_microstructure_daily.daytrade_source),updated_at=excluded.updated_at`,
        args:[symbol,tradeDate,m?.marginPrevBalance??null,m?.marginBuy??null,m?.marginSell??null,m?.marginCashRepay??null,m?.marginBalance??null,m?.marginUtilizationPct??null,m?.shortPrevBalance??null,m?.shortSell??null,m?.shortBuy??null,m?.shortRepay??null,m?.shortBalance??null,d?.daytradeVolume??null,d?.daytradeBuyValue??null,d?.daytradeSellValue??null,m?.source??null,d?.source??null,writeAt]};
    });
    await executeManyChunked(db,statements);
    if(snapshot.indexRows.length){
      await executeManyChunked(db,snapshot.indexRows.map(row=>({sql:`INSERT INTO market_index_daily(index_code,trade_date,display_name,close,change_pct,source,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(index_code,trade_date) DO UPDATE SET display_name=excluded.display_name,close=excluded.close,change_pct=excluded.change_pct,source=excluded.source,updated_at=excluded.updated_at`,args:[row.indexCode,row.tradeDate,row.displayName,row.close,row.changePct,row.source,writeAt]})));
    }
    // Keep only a compact rolling window. Reads are always restricted to Top40.
    await db.execute({sql:"DELETE FROM market_microstructure_daily WHERE trade_date<?",args:[isoDateDaysBefore(tradeDate,MICROSTRUCTURE_RETENTION_DAYS)]}).catch(()=>undefined);

    const completed=snapshot.successfulRequests>0;
    await db.execute({sql:`UPDATE public_risk_snapshot_runs SET status=?,margin_rows=?,daytrade_rows=?,index_rows=?,external_requests=?,successful_requests=?,source_json=?,last_error=?,completed_at=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE trade_date=? AND lease_token=?`,args:[completed?"completed":"failed",snapshot.marginRows.length,snapshot.daytradeRows.length,snapshot.indexRows.length,snapshot.externalRequests,snapshot.successfulRequests,JSON.stringify(snapshot.sources),snapshot.errors.length?snapshot.errors.join("；").slice(0,1800):null,completed?writeAt:null,writeAt,tradeDate,token]});
    return {cached:false,status:completed?"completed":"failed",marginRows:snapshot.marginRows.length,daytradeRows:snapshot.daytradeRows.length,indexRows:snapshot.indexRows.length,externalRequests:snapshot.externalRequests,successfulRequests:snapshot.successfulRequests,sources:snapshot.sources,lastError:snapshot.errors.length?snapshot.errors.join("；"):null,updatedAt:writeAt,completedAt:completed?writeAt:null};
  } catch(error){
    const message=error instanceof Error?error.message:String(error);
    await db.execute({sql:"UPDATE public_risk_snapshot_runs SET status='failed',last_error=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE trade_date=? AND lease_token=?",args:[message.slice(0,1800),new Date().toISOString(),tradeDate,token]}).catch(()=>undefined);
    throw error;
  }
}

function basePotentialFromWinner(row:DatabaseRow|undefined){
  if(!row) return 0;
  const stealth=numeric(row.stealth_score), breakout=numeric(row.breakout_score);
  const active=Boolean(Number(row.model_active??0));
  const confidence=Number(row.stealth_confidence_pct??0);
  const stealthUsable=stealth!=null&&confidence>=35;
  let raw=0;
  if(stealthUsable&&active&&breakout!=null) raw=stealth*.65+breakout*.35;
  else if(stealthUsable) raw=stealth??0;
  else if(active&&breakout!=null) raw=breakout;
  return round(raw,1);
}

export async function refreshCandidateRiskIntelligence(db:DatabaseAdapter, symbols:string[], tradeDate:string){
  const unique=[...new Set(symbols.map(String).filter(Boolean))];
  if(!unique.length) return {ok:true,total:0,scored:0,externalRequests:0,successfulRequests:0,snapshot:null,marketRisk:null};
  const snapshot=await ensurePublicRiskSnapshot(db,tradeDate,unique).catch(error=>({cached:false,status:"failed",externalRequests:0,successfulRequests:0,lastError:error instanceof Error?error.message:String(error)}));
  const placeholders=marks(unique.length);
  const historyStart=isoDateDaysBefore(tradeDate,45);
  const [micro,accum,currentForeign,winner,prices,regime,indexRows]=await Promise.all([
    db.execute<DatabaseRow>({sql:`SELECT symbol,trade_date,margin_prev_balance,margin_balance,daytrade_volume FROM market_microstructure_daily WHERE symbol IN (${placeholders}) AND trade_date>=? AND trade_date<=? ORDER BY symbol,trade_date`,args:[...unique,historyStart,tradeDate]}).catch(()=>({rows:[],rowsAffected:0} as any)),
    db.execute<DatabaseRow>({sql:`SELECT symbol,trade_date,foreign_5,foreign_10,foreign_20,buy_days_5,buy_days_20,price_5_pct FROM foreign_accumulation_latest WHERE symbol IN (${placeholders})`,args:unique}).catch(()=>({rows:[],rowsAffected:0} as any)),
    db.execute<DatabaseRow>({sql:`SELECT symbol,net_buy_shares FROM foreign_investor_daily WHERE trade_date=? AND symbol IN (${placeholders})`,args:[tradeDate,...unique]}).catch(()=>({rows:[],rowsAffected:0} as any)),
    db.execute<DatabaseRow>({sql:`SELECT symbol,as_of_date,model_active,breakout_score,stealth_score,stealth_confidence_pct,features_json FROM winner25_live_scores WHERE symbol IN (${placeholders})`,args:unique}).catch(()=>({rows:[],rowsAffected:0} as any)),
    db.execute<DatabaseRow>({sql:`SELECT symbol,volume FROM daily_prices WHERE trade_date=? AND symbol IN (${placeholders})`,args:[tradeDate,...unique]}).catch(()=>({rows:[],rowsAffected:0} as any)),
    db.execute<DatabaseRow>({sql:"SELECT market_score,risk_level,regime,confidence FROM market_regime_daily ORDER BY regime_date DESC LIMIT 1"}).catch(()=>({rows:[],rowsAffected:0} as any)),
    db.execute<DatabaseRow>({sql:"SELECT trade_date,close,change_pct FROM market_index_daily WHERE index_code='TAIEX' AND trade_date<=? ORDER BY trade_date DESC LIMIT 30",args:[tradeDate]}).catch(()=>({rows:[],rowsAffected:0} as any)),
  ]);

  const microMap=new Map<string,DatabaseRow[]>();
  for(const row of micro.rows){ const symbol=String(row.symbol); const list=microMap.get(symbol)??[]; list.push(row); microMap.set(symbol,list); }
  const accumMap=new Map<string,DatabaseRow>((accum.rows as readonly DatabaseRow[]).map((row:DatabaseRow)=>[String(row.symbol),row]));
  const currentForeignMap=new Map<string,DatabaseRow>((currentForeign.rows as readonly DatabaseRow[]).map((row:DatabaseRow)=>[String(row.symbol),row]));
  const winnerMap=new Map<string,DatabaseRow>((winner.rows as readonly DatabaseRow[]).map((row:DatabaseRow)=>[String(row.symbol),row]));
  const priceMap=new Map<string,DatabaseRow>((prices.rows as readonly DatabaseRow[]).map((row:DatabaseRow)=>[String(row.symbol),row]));
  const taiexChronological=[...indexRows.rows].reverse();
  const taiexCloses=taiexChronological.map(row=>numeric(row.close)).filter((v):v is number=>v!=null);
  const taiexChange=numeric(taiexChronological.at(-1)?.change_pct);
  const globalMarketScore=numeric(regime.rows[0]?.market_score);
  const marketRisk=calculateMarketRisk({globalMarketScore,taiexCloses,taiexChangePct:taiexChange});
  const now=new Date().toISOString();
  const statements:DatabaseStatement[]=[];
  let scored=0;

  for(const symbol of unique){
    const history=microMap.get(symbol)??[];
    const marginBalances=history.map(row=>numeric(row.margin_balance));
    const currentMicro=[...history].reverse().find(row=>String(row.trade_date)===tradeDate)??history.at(-1);
    const a=accumMap.get(symbol);
    const w=winnerMap.get(symbol);
    const features=parseJsonObject(w?.features_json);
    const basePotential=basePotentialFromWinner(w);
    const margin=calculateMarginWashout({balances:marginBalances,currentPrevBalance:numeric(currentMicro?.margin_prev_balance),price5Pct:numeric(a?.price_5_pct),foreign5:numeric(a?.foreign_5)});
    const foreign=calculateForeignPersistence({foreign5:numeric(a?.foreign_5),foreign10:numeric(a?.foreign_10),foreign20:numeric(a?.foreign_20),buyDays5:numeric(a?.buy_days_5),buyDays20:numeric(a?.buy_days_20),todayNet:numeric(currentForeignMap.get(symbol)?.net_buy_shares)});
    const daytrade=calculateDaytradeNoise({daytradeVolume:numeric(currentMicro?.daytrade_volume),marketVolume:numeric(priceMap.get(symbol)?.volume),foreignOneDayShare5Pct:foreign.oneDayShare5Pct});
    const betaProxy=betaProxyFromVolatility(numeric(features.volatility20Pct));
    const overlay=combineDecisionOverlay({basePotential,market:marketRisk,betaProxy,margin,foreign,daytrade});
    const available=[true,margin.score!=null,foreign.score!=null,daytrade.ratioPct!=null];
    const confidence=round((available.filter(Boolean).length/available.length)*100,0);
    const reasons=[...marketRisk.reasons,...margin.reasons,...foreign.reasons,...daytrade.reasons];
    const sources={market:"TWSE TAIEX + market_regime_daily",margin:currentMicro?.margin_balance!=null?"TWSE/TPEx official":"unavailable",daytrade:currentMicro?.daytrade_volume!=null?"TWSE/TPEx official":"unavailable",foreign:"foreign_accumulation_latest"};
    statements.push({sql:`INSERT INTO risk_intelligence_latest(
      symbol,trade_date,base_potential_score,decision_score,decision_modifier,market_risk_score,market_risk_level,market_risk_modifier,beta_proxy,
      margin_washout_score,margin_change_1d_pct,margin_change_5d_pct,margin_change_10d_pct,margin_modifier,
      foreign_persistence_score,foreign_1d_share_5d_pct,foreign_modifier,daytrade_ratio_pct,daytrade_noise_penalty,data_confidence_pct,reasons_json,source_json,calculated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(symbol) DO UPDATE SET
      trade_date=excluded.trade_date,base_potential_score=excluded.base_potential_score,decision_score=excluded.decision_score,decision_modifier=excluded.decision_modifier,
      market_risk_score=excluded.market_risk_score,market_risk_level=excluded.market_risk_level,market_risk_modifier=excluded.market_risk_modifier,beta_proxy=excluded.beta_proxy,
      margin_washout_score=excluded.margin_washout_score,margin_change_1d_pct=excluded.margin_change_1d_pct,margin_change_5d_pct=excluded.margin_change_5d_pct,margin_change_10d_pct=excluded.margin_change_10d_pct,margin_modifier=excluded.margin_modifier,
      foreign_persistence_score=excluded.foreign_persistence_score,foreign_1d_share_5d_pct=excluded.foreign_1d_share_5d_pct,foreign_modifier=excluded.foreign_modifier,
      daytrade_ratio_pct=excluded.daytrade_ratio_pct,daytrade_noise_penalty=excluded.daytrade_noise_penalty,data_confidence_pct=excluded.data_confidence_pct,reasons_json=excluded.reasons_json,source_json=excluded.source_json,calculated_at=excluded.calculated_at`,
      args:[symbol,tradeDate,basePotential,overlay.decisionScore,overlay.modifier,marketRisk.score,marketRisk.level,overlay.marketModifier,betaProxy,margin.score,margin.change1dPct,margin.change5dPct,margin.change10dPct,margin.modifier,foreign.score,foreign.oneDayShare5Pct,foreign.modifier,daytrade.ratioPct,daytrade.penalty,confidence,JSON.stringify(reasons),JSON.stringify(sources),now]});
    scored+=1;
  }
  await executeManyChunked(db,statements,100);
  return {ok:true,total:unique.length,scored,tradeDate,marketRisk,snapshot,externalRequests:Number((snapshot as any)?.externalRequests??0),successfulRequests:Number((snapshot as any)?.successfulRequests??0)};
}

export async function readRiskIntelligenceRows(db:DatabaseAdapter,symbols:string[]){
  const unique=[...new Set(symbols.map(String).filter(Boolean))];
  if(!unique.length) return [] as DatabaseRow[];
  return [...(await db.execute<DatabaseRow>({sql:`SELECT * FROM risk_intelligence_latest WHERE symbol IN (${marks(unique.length)})`,args:unique})).rows];
}
