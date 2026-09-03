import { randomUUID } from "node:crypto";
import { TursoDatabaseAdapter } from "@/adapters/turso";
import { getTursoClient } from "@/lib/turso";
import { MigrationRunner } from "@/migrations/database/MigrationRunner";
import { tursoMigrations } from "@/migrations/turso";
import type { DatabaseAdapter, DatabaseRow, DatabaseStatement } from "@/lib/database";
import {
  WINNER25_FEATURE_LABELS,
  calculateWinner25Features,
  normalizeDistributionRows,
  normalizeInstitutionalRows,
  normalizePriceRows,
  type Winner25Features,
} from "./features";

const WINNER_THRESHOLD_PCT = 25;
const HORIZON_DAYS = 20;
const MIN_HISTORY_DAYS = 60;
const CONTROL_STRIDE = 10;
const WINNER_COOLDOWN = 20;
const RULE_QUANTILES = [0.2,0.35,0.5,0.65,0.8];
const MAX_RULES = 12;

const n = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0;
const json = (v: unknown) => { try { return JSON.parse(String(v ?? "{}")); } catch { return {}; } };
const round = (v:number,d=2) => Number(v.toFixed(d));
const iso = (d:Date) => d.toISOString().slice(0,10);

async function database() {
  const db = new TursoDatabaseAdapter(getTursoClient());
  await new MigrationRunner(db,tursoMigrations).migrate();
  return db;
}

function twoYearsBefore(dateText:string) {
  const d = new Date(`${dateText}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear()-2);
  return iso(d);
}

function prefetchStart(historyStart:string) {
  const d = new Date(`${historyStart}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate()-120);
  return iso(d);
}

function quantile(sorted:number[], q:number) {
  if(!sorted.length) return null;
  const pos=(sorted.length-1)*q;
  const base=Math.floor(pos), rest=pos-base;
  return sorted[base+1] != null ? sorted[base] + rest*(sorted[base+1]-sorted[base]) : sorted[base];
}

function condition(value:number|null|undefined,direction:string,threshold:number) {
  if(value==null || !Number.isFinite(value)) return false;
  return direction === ">=" ? value >= threshold : value <= threshold;
}

type Sample = {
  symbol:string;
  signalDate:string;
  baseClose:number;
  futureMaxClose:number;
  futureMaxDate:string;
  futureReturnPct:number;
  daysToPeak:number;
  isWinner:boolean;
  sampleKind:"winner"|"control";
  features:Winner25Features;
};

type Rule = {
  featureKey:string;
  direction:">="|"<=";
  threshold:number;
  trainSupport:number;
  trainWinners:number;
  trainWinRate:number;
  trainLift:number;
  testSupport:number;
  testWinners:number;
  testWinRate:number;
  testLift:number;
  scoreWeight:number;
  description:string;
};

async function executeManyResilient(db:DatabaseAdapter, statements:DatabaseStatement[], chunkSize=8) {
  if(!statements.length) return;
  for(let i=0;i<statements.length;i+=chunkSize) {
    const chunk=statements.slice(i,i+chunkSize);
    try {
      await db.executeMany(chunk);
    } catch (batchError) {
      // Turso/libSQL batch occasionally fails on larger JSON payloads.
      // Fall back to single statements so the scan can continue and reveal the exact failing row.
      for(const statement of chunk) {
        try {
          await db.execute(statement);
        } catch (singleError) {
          const batchMessage=batchError instanceof Error?batchError.message:String(batchError);
          const singleMessage=singleError instanceof Error?singleError.message:String(singleError);
          throw new Error(`Winner25 寫入失敗。batch=${batchMessage}; single=${singleMessage}`);
        }
      }
    }
  }
}

function buildSamples(
  symbol:string,
  prices:ReturnType<typeof normalizePriceRows>,
  institutional:ReturnType<typeof normalizeInstitutionalRows>,
  distribution:ReturnType<typeof normalizeDistributionRows>,
  historyStart:string,
  historyEnd:string,
): Sample[] {
  const out:Sample[]=[];
  let winnerCooldownUntil=-1;
  for(let i=MIN_HISTORY_DAYS;i<prices.length-HORIZON_DAYS;i++) {
    const row=prices[i];
    if(row.trade_date < historyStart || row.trade_date > historyEnd) continue;
    const base=row.close;
    if(base==null || base<=0) continue;
    const future=prices.slice(i+1,i+1+HORIZON_DAYS).filter(x=>x.close!=null && x.close!>0);
    if(future.length < Math.min(15,HORIZON_DAYS)) continue;
    let peak=future[0];
    for(const p of future) if((p.close ?? 0) > (peak.close ?? 0)) peak=p;
    const futureReturnPct=((peak.close! / base)-1)*100;
    const winner=futureReturnPct >= WINNER_THRESHOLD_PCT;

    // 同一段主升行情只留第一個 Winner anchor，避免同一波行情重複灌入樣本。
    if(winner && i <= winnerCooldownUntil) continue;
    if(!winner && i % CONTROL_STRIDE !== 0) continue;

    const features=calculateWinner25Features(prices,i,institutional,distribution);
    if(!features) continue;
    out.push({
      symbol,signalDate:row.trade_date,baseClose:base,
      futureMaxClose:peak.close!,futureMaxDate:peak.trade_date,
      futureReturnPct:round(futureReturnPct,4),daysToPeak:future.indexOf(peak)+1,
      isWinner:winner,sampleKind:winner?"winner":"control",features,
    });
    if(winner) winnerCooldownUntil=i+WINNER_COOLDOWN;
  }
  return out;
}

function splitByTime(samples:Sample[]) {
  const dates=[...new Set(samples.map(s=>s.signalDate))].sort();
  const cutoff=dates[Math.max(0,Math.floor(dates.length*0.7)-1)] ?? "9999-12-31";
  return {
    cutoff,
    train:samples.filter(s=>s.signalDate<=cutoff),
    test:samples.filter(s=>s.signalDate>cutoff),
  };
}

function evaluateRule(samples:Sample[],featureKey:string,direction:">="|"<=",threshold:number) {
  const matched=samples.filter(s=>condition(s.features[featureKey],direction,threshold));
  const winners=matched.filter(s=>s.isWinner).length;
  const baseline=samples.length ? samples.filter(s=>s.isWinner).length/samples.length : 0;
  const winRate=matched.length ? winners/matched.length : 0;
  return {support:matched.length,winners,winRate,lift:baseline>0?winRate/baseline:0};
}

function mineRules(samples:Sample[]): {rules:Rule[];cutoff:string;trainBaseline:number;testBaseline:number} {
  const {cutoff,train,test}=splitByTime(samples);
  const trainBaseline=train.length?train.filter(s=>s.isWinner).length/train.length:0;
  const testBaseline=test.length?test.filter(s=>s.isWinner).length/test.length:0;
  const featureKeys=Object.keys(WINNER25_FEATURE_LABELS);
  const candidates:Rule[]=[];
  const minTrainSupport=Math.max(20,Math.floor(train.length*0.01));
  const minTestSupport=Math.max(8,Math.floor(test.length*0.005));

  for(const featureKey of featureKeys) {
    const values=train.map(s=>s.features[featureKey]).filter((v):v is number=>v!=null && Number.isFinite(v)).sort((a,b)=>a-b);
    if(values.length<50) continue;
    let best:Rule|null=null;
    for(const q of RULE_QUANTILES) {
      const threshold=quantile(values,q);
      if(threshold==null) continue;
      for(const direction of [">=","<="] as const) {
        const tr=evaluateRule(train,featureKey,direction,threshold);
        const te=evaluateRule(test,featureKey,direction,threshold);
        if(tr.support<minTrainSupport || tr.winners<5 || te.support<minTestSupport) continue;
        if(tr.lift<1.2 || te.lift<1.05) continue;
        const reliability=Math.min(2.5,te.lift) * Math.log1p(te.support) * Math.min(2.5,tr.lift);
        const rule:Rule={
          featureKey,direction,threshold:round(threshold,4),
          trainSupport:tr.support,trainWinners:tr.winners,trainWinRate:tr.winRate,trainLift:tr.lift,
          testSupport:te.support,testWinners:te.winners,testWinRate:te.winRate,testLift:te.lift,
          scoreWeight:reliability,
          description:`${WINNER25_FEATURE_LABELS[featureKey]} ${direction} ${round(threshold,2)}`,
        };
        if(!best || reliability>best.scoreWeight) best=rule;
      }
    }
    if(best) candidates.push(best);
  }

  candidates.sort((a,b)=>b.scoreWeight-a.scoreWeight);
  const selected=candidates.slice(0,MAX_RULES);
  const totalWeight=selected.reduce((s,r)=>s+r.scoreWeight,0)||1;
  for(const r of selected) r.scoreWeight=round((r.scoreWeight/totalWeight)*100,4);
  return {rules:selected,cutoff,trainBaseline,testBaseline};
}

function modelGate(rules:Rule[], testBaseline:number) {
  if(rules.length<5 || testBaseline<=0) return false;
  const weightedLift=rules.reduce((s,r)=>s+r.testLift*r.scoreWeight,0)/100;
  const reliable=rules.filter(r=>r.testSupport>=10 && r.testWinners>=2 && r.testLift>=1.1).length;
  return weightedLift>=1.15 && reliable>=4;
}

export async function startWinner25Run() {
  const db=await database();
  const latest=await db.execute<DatabaseRow>({sql:"SELECT trade_date AS latest_date FROM indicator_latest ORDER BY trade_date DESC LIMIT 1"});
  const historyEnd=String(latest.rows[0]?.latest_date??"");
  if(!historyEnd) throw new Error("daily_prices 尚無歷史資料，無法執行 Winner25。");
  const historyStart=twoYearsBefore(historyEnd);
  const total=await db.execute<DatabaseRow>({sql:"SELECT COUNT(*) AS count FROM stocks WHERE is_active=1"});
  const id=randomUUID(), now=new Date().toISOString();
  await db.execute({sql:`INSERT INTO winner25_runs(id,status,started_at,updated_at,history_start,history_end,total_symbols,settings_json)
    VALUES(?,?,?,?,?,?,?,?)`,args:[id,"running",now,now,historyStart,historyEnd,n(total.rows[0]?.count),JSON.stringify({winnerThresholdPct:WINNER_THRESHOLD_PCT,horizonDays:HORIZON_DAYS,controlStride:CONTROL_STRIDE,winnerCooldown:WINNER_COOLDOWN,timeSplit:"70/30 chronological"})]});
  return {ok:true,runId:id,historyStart,historyEnd,totalSymbols:n(total.rows[0]?.count)};
}

export async function runWinner25Step(runId:string,batchSize=20) {
  const db=await database();
  const run=(await db.execute<DatabaseRow>({sql:"SELECT * FROM winner25_runs WHERE id=?",args:[runId]})).rows[0];
  if(!run) throw new Error("Winner25 run 不存在");
  if(String(run.status)==="completed") return {ok:true,status:"completed",processed:0};
  const lastSymbol=String(run.last_symbol??"");
  const symbols=await db.execute<DatabaseRow>({sql:"SELECT symbol FROM stocks WHERE is_active=1 AND symbol>? ORDER BY symbol LIMIT ?",args:[lastSymbol,Math.max(1,Math.min(50,batchSize))]});
  if(!symbols.rows.length) return await finalizeWinner25Run(runId);

  let samplesInserted=0,winnersInserted=0,last=lastSymbol;
  const historyStart=String(run.history_start), historyEnd=String(run.history_end);
  const from=prefetchStart(historyStart), now=new Date().toISOString();
  for(const sr of symbols.rows) {
    const symbol=String(sr.symbol); last=symbol;
    const [priceRows,instRows,distRows]=await Promise.all([
      db.execute<DatabaseRow>({sql:"SELECT symbol,trade_date,open,high,low,close,volume,turnover FROM daily_prices WHERE symbol=? AND trade_date>=? AND trade_date<=? ORDER BY trade_date",args:[symbol,from,historyEnd]}),
      db.execute<DatabaseRow>({sql:"SELECT trade_date,foreign_net_shares,trust_net_shares,foreign_holding_pct FROM institutional_holding_daily WHERE symbol=? AND trade_date>=? AND trade_date<=? ORDER BY trade_date",args:[symbol,from,historyEnd]}).catch(()=>({rows:[],rowsAffected:0} as any)),
      db.execute<DatabaseRow>({sql:"SELECT report_date,large_holder_pct,retail_proxy_pct FROM shareholding_distribution_weekly WHERE symbol=? AND report_date<=? ORDER BY report_date",args:[symbol,historyEnd]}).catch(()=>({rows:[],rowsAffected:0} as any)),
    ]);
    const samples=buildSamples(symbol,normalizePriceRows(priceRows.rows),normalizeInstitutionalRows(instRows.rows),normalizeDistributionRows(distRows.rows),historyStart,historyEnd);
    if(samples.length) {
      try {
        await executeManyResilient(db,samples.map(s=>({sql:`INSERT OR REPLACE INTO winner25_samples(run_id,symbol,signal_date,base_close,future_max_close,future_max_date,future_return_pct,days_to_peak,is_winner,sample_kind,features_json,created_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,args:[runId,s.symbol,s.signalDate,s.baseClose,s.futureMaxClose,s.futureMaxDate,s.futureReturnPct,s.daysToPeak,s.isWinner?1:0,s.sampleKind,JSON.stringify(s.features),now]})));
      } catch (error) {
        const message=error instanceof Error?error.message:String(error);
        await db.execute({sql:"UPDATE winner25_runs SET last_symbol=?,updated_at=?,last_error=? WHERE id=?",args:[symbol,new Date().toISOString(),`股票 ${symbol}: ${message}`,runId]});
        throw new Error(`Winner25 掃描 ${symbol} 失敗：${message}`);
      }
      samplesInserted+=samples.length;
      winnersInserted+=samples.filter(s=>s.isWinner).length;
    }
  }
  const processed=n(run.processed_symbols)+symbols.rows.length;
  const sampleCount=n(run.sample_count)+samplesInserted;
  const winnerCount=n(run.winner_count)+winnersInserted;
  await db.execute({sql:"UPDATE winner25_runs SET last_symbol=?,processed_symbols=?,sample_count=?,winner_count=?,updated_at=? WHERE id=?",args:[last,processed,sampleCount,winnerCount,new Date().toISOString(),runId]});
  const total=n(run.total_symbols);
  return {ok:true,status:"running",runId,processed,total,percentage:total?round(processed/total*100,1):0,batchProcessed:symbols.rows.length,samplesInserted,winnersInserted,lastSymbol:last};
}

export async function finalizeWinner25Run(runId:string) {
  const db=await database();
  const rows=await db.execute<DatabaseRow>({sql:"SELECT symbol,signal_date,base_close,future_max_close,future_max_date,future_return_pct,days_to_peak,is_winner,sample_kind,features_json FROM winner25_samples WHERE run_id=? ORDER BY signal_date,symbol",args:[runId]});
  const samples:Sample[]=rows.rows.map(r=>({
    symbol:String(r.symbol),signalDate:String(r.signal_date),baseClose:n(r.base_close),futureMaxClose:n(r.future_max_close),futureMaxDate:String(r.future_max_date),futureReturnPct:n(r.future_return_pct),daysToPeak:n(r.days_to_peak),isWinner:Boolean(n(r.is_winner)),sampleKind:String(r.sample_kind)==="winner"?"winner":"control",features:json(r.features_json),
  }));
  if(samples.length<100) throw new Error(`Winner25 樣本不足：${samples.length}`);
  const mined=mineRules(samples);
  const {train,test}=splitByTime(samples);
  const active=modelGate(mined.rules,mined.testBaseline);
  const now=new Date().toISOString();
  await db.transaction(async tx=>{
    await tx.execute({sql:"DELETE FROM winner25_rules WHERE run_id=?",args:[runId]});
    if(mined.rules.length) await tx.executeMany(mined.rules.map((r,index)=>({sql:`INSERT INTO winner25_rules(run_id,rank,feature_key,direction,threshold,train_support,train_winners,train_win_rate,train_lift,test_support,test_winners,test_win_rate,test_lift,score_weight,description,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,args:[runId,index+1,r.featureKey,r.direction,r.threshold,r.trainSupport,r.trainWinners,r.trainWinRate,r.trainLift,r.testSupport,r.testWinners,r.testWinRate,r.testLift,r.scoreWeight,r.description,now]})));
    const bestLift=Math.max(0,...mined.rules.map(r=>r.testLift));
    const summary={cutoff:mined.cutoff,thresholdPct:WINNER_THRESHOLD_PCT,horizonDays:HORIZON_DAYS,ruleCount:mined.rules.length,modelActive:active,notes:["只用訊號日當下及以前資料計算特徵","Winner 定義：未來20交易日最高收盤價相對訊號日收盤 >=25%","規則只從前70%時間樣本學習，後30%時間樣本做 out-of-sample 驗證"]};
    await tx.execute({sql:`UPDATE winner25_runs SET status='completed',completed_at=?,updated_at=?,sample_count=?,winner_count=?,train_sample_count=?,train_winner_count=?,test_sample_count=?,test_winner_count=?,baseline_train_rate=?,baseline_test_rate=?,best_test_lift=?,model_active=?,summary_json=?,last_error=NULL WHERE id=?`,args:[now,now,samples.length,samples.filter(s=>s.isWinner).length,train.length,train.filter(s=>s.isWinner).length,test.length,test.filter(s=>s.isWinner).length,mined.trainBaseline,mined.testBaseline,bestLift,active?1:0,JSON.stringify(summary),runId]});
  });
  return {ok:true,status:"completed",runId,samples:samples.length,winners:samples.filter(s=>s.isWinner).length,trainBaselinePct:round(mined.trainBaseline*100,2),testBaselinePct:round(mined.testBaseline*100,2),rules:mined.rules,modelActive:active};
}

export async function readWinner25Report(runId?:string) {
  const db=await database();
  const runResult=runId
    ? await db.execute<DatabaseRow>({sql:"SELECT * FROM winner25_runs WHERE id=?",args:[runId]})
    : await db.execute<DatabaseRow>({sql:"SELECT * FROM winner25_runs ORDER BY started_at DESC LIMIT 1"});
  const run=runResult.rows[0];
  if(!run) return {ok:true,run:null,rules:[],winners:[]};
  const id=String(run.id);
  const [rules,winners]=await Promise.all([
    db.execute<DatabaseRow>({sql:"SELECT * FROM winner25_rules WHERE run_id=? ORDER BY rank",args:[id]}),
    db.execute<DatabaseRow>({sql:"SELECT symbol,signal_date,base_close,future_max_close,future_max_date,future_return_pct,days_to_peak,features_json FROM winner25_samples WHERE run_id=? AND is_winner=1 ORDER BY future_return_pct DESC LIMIT 100",args:[id]}),
  ]);
  return {ok:true,run:{...run,settings:json(run.settings_json),summary:json(run.summary_json)},rules:rules.rows,winners:winners.rows.map(r=>({...r,features:json(r.features_json)}))};
}

export type LiveBreakoutResult = {
  score:number|null;
  modelRunId:string|null;
  modelActive:boolean;
  reasons:string[];
  missing:string[];
  featureCount:number;
  requiredFeatureCount:number;
  asOfDate:string|null;
  features?:Winner25Features;
};


export type Winner25LiveModel = {
  runId: string | null;
  active: boolean;
  rules: readonly DatabaseRow[];
  reason?: string;
};

export async function loadWinner25LiveModel(db: DatabaseAdapter): Promise<Winner25LiveModel> {
  const latestRun=(await db.execute<DatabaseRow>({
    sql:"SELECT * FROM winner25_runs WHERE status='completed' ORDER BY completed_at DESC LIMIT 1",
  })).rows[0];
  if(!latestRun) return {runId:null,active:false,rules:[],reason:"尚未完成 Winner25 歷史模型"};
  const runId=String(latestRun.id);
  const rules=(await db.execute<DatabaseRow>({
    sql:"SELECT * FROM winner25_rules WHERE run_id=? ORDER BY rank",args:[runId],
  })).rows;
  return {
    runId,
    active:Boolean(n(latestRun.model_active)),
    rules,
    reason:rules.length?undefined:"Winner25 模型沒有有效規則",
  };
}

const LIVE_REQUIRED_FEATURES = [
  "range20Pct","volatility20Pct","ret5","ret10","ret20","distanceTo20HighPct",
  "distanceTo60HighPct","drawdown20Pct","closeVsMa20Pct","closeVsMa60Pct",
  "ma20Slope5Pct","ma60Slope10Pct",
] as const;

async function loadRecentPriceRows(db:DatabaseAdapter,symbol:string,date:string) {
  // M8.10.5: live scoring needs actual trading rows, not a calendar-day estimate.
  // Always take the latest 180 valid trading rows and then restore chronological order.
  // This removes the false "price feature missing" state caused by sparse calendar windows.
  const result=await db.execute<DatabaseRow>({
    sql:`SELECT symbol,trade_date,open,high,low,close,volume,turnover FROM (
      SELECT symbol,trade_date,open,high,low,close,volume,turnover
      FROM daily_prices
      WHERE symbol=? AND trade_date<=? AND close IS NOT NULL AND close>0
      ORDER BY trade_date DESC LIMIT 180
    ) ORDER BY trade_date`,
    args:[symbol,date],
  });
  return [...result.rows];
}

async function loadLiveFeatureContext(db:DatabaseAdapter,symbol:string,asOfDate?:string) {
  const date=asOfDate || String((await db.execute<DatabaseRow>({
    sql:"SELECT trade_date AS d FROM indicator_latest WHERE symbol=? LIMIT 1",args:[symbol],
  })).rows[0]?.d??"");
  if(!date) return {date:null,features:null as Winner25Features|null,priceRows:0,missing:["無可用價格日期"]};

  const priceRows=await loadRecentPriceRows(db,symbol,date);
  const [instRows,distRows]=await Promise.all([
    db.execute<DatabaseRow>({
      sql:`SELECT trade_date,foreign_net_shares,trust_net_shares,foreign_holding_pct
           FROM institutional_holding_daily
           WHERE symbol=? AND trade_date<=?
           ORDER BY trade_date DESC LIMIT 80`,args:[symbol,date],
    }).catch(()=>({rows:[],rowsAffected:0} as any)),
    db.execute<DatabaseRow>({
      sql:`SELECT report_date,large_holder_pct,retail_proxy_pct
           FROM shareholding_distribution_weekly
           WHERE symbol=? AND report_date<=?
           ORDER BY report_date DESC LIMIT 16`,args:[symbol,date],
    }).catch(()=>({rows:[],rowsAffected:0} as any)),
  ]);

  const prices=normalizePriceRows(priceRows);
  if(prices.length<MIN_HISTORY_DAYS){
    return {date,features:null as Winner25Features|null,priceRows:prices.length,missing:[`歷史價格僅 ${prices.length} 交易日（至少需 ${MIN_HISTORY_DAYS}）`]};
  }
  // DB queries above are DESC for bounded I/O; normalizers expect chronological order.
  const institutional=normalizeInstitutionalRows([...instRows.rows].reverse());
  const distribution=normalizeDistributionRows([...distRows.rows].reverse());
  const features=calculateWinner25Features(prices,prices.length-1,institutional,distribution);
  if(!features) return {date,features:null as Winner25Features|null,priceRows:prices.length,missing:["Winner25 即時特徵計算失敗"]};
  return {date,features,priceRows:prices.length,missing:[] as string[]};
}

export async function calculateBreakoutScoreForSymbol(
  db:DatabaseAdapter,
  symbol:string,
  asOfDate?:string,
  model?:Winner25LiveModel,
):Promise<LiveBreakoutResult> {
  const liveModel=model??await loadWinner25LiveModel(db);
  if(!liveModel.runId) return {score:null,modelRunId:null,modelActive:false,reasons:[liveModel.reason??"尚未完成 Winner25 歷史模型"],missing:["Winner25 model"],featureCount:0,requiredFeatureCount:LIVE_REQUIRED_FEATURES.length,asOfDate:null};
  const runId=liveModel.runId, active=liveModel.active, rules=liveModel.rules;
  if(!rules.length) return {score:null,modelRunId:runId,modelActive:false,reasons:[liveModel.reason??"Winner25 模型沒有有效規則"],missing:["Winner25 rules"],featureCount:0,requiredFeatureCount:LIVE_REQUIRED_FEATURES.length,asOfDate:null};

  const ctx=await loadLiveFeatureContext(db,symbol,asOfDate);
  if(!ctx.features) return {score:null,modelRunId:runId,modelActive:active,reasons:ctx.missing,missing:ctx.missing,featureCount:0,requiredFeatureCount:LIVE_REQUIRED_FEATURES.length,asOfDate:ctx.date};
  const features=ctx.features;
  const presentRequired=LIVE_REQUIRED_FEATURES.filter(k=>features[k]!=null && Number.isFinite(Number(features[k])));
  const missing=LIVE_REQUIRED_FEATURES.filter(k=>features[k]==null || !Number.isFinite(Number(features[k]))).map(k=>WINNER25_FEATURE_LABELS[k]??k);

  let matchedWeight=0, availableWeight=0;
  const reasons:string[]=[];
  for(const rr of rules) {
    const key=String(rr.feature_key),dir=String(rr.direction),threshold=n(rr.threshold),weight=n(rr.score_weight),value=features[key];
    if(value==null || !Number.isFinite(Number(value))) continue;
    availableWeight+=weight;
    if(condition(value,dir,threshold)) {
      matchedWeight+=weight;
      reasons.push(`${WINNER25_FEATURE_LABELS[key]??key} ${dir} ${round(threshold,2)}（目前 ${round(Number(value),2)}；OOS Lift ${round(n(rr.test_lift),2)}x）`);
    }
  }
  const coverage=presentRequired.length/LIVE_REQUIRED_FEATURES.length;
  const score=availableWeight>0 && coverage>=0.75 ? round(Math.min(100,(matchedWeight/availableWeight)*100),1) : null;
  if(score==null && coverage<0.75) reasons.unshift(`Winner25 價格特徵完整度僅 ${round(coverage*100,0)}%`);
  if(missing.length) reasons.push(`缺少：${missing.slice(0,4).join("、")}${missing.length>4?"…":""}`);
  return {
    score,modelRunId:runId,modelActive:active,reasons:reasons.slice(0,8),missing,
    featureCount:presentRequired.length,requiredFeatureCount:LIVE_REQUIRED_FEATURES.length,
    asOfDate:ctx.date,features,
  };
}

export async function persistLiveBreakoutScore(db:DatabaseAdapter,symbol:string,result:LiveBreakoutResult){
  const now=new Date().toISOString();
  await db.execute({
    sql:`INSERT INTO winner25_live_scores(symbol,as_of_date,model_run_id,model_active,breakout_score,feature_count,required_feature_count,reasons_json,missing_json,features_json,calculated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(symbol) DO UPDATE SET
           as_of_date=excluded.as_of_date,model_run_id=excluded.model_run_id,model_active=excluded.model_active,
           breakout_score=excluded.breakout_score,feature_count=excluded.feature_count,required_feature_count=excluded.required_feature_count,
           reasons_json=excluded.reasons_json,missing_json=excluded.missing_json,features_json=excluded.features_json,calculated_at=excluded.calculated_at`,
    args:[symbol,result.asOfDate??"",result.modelRunId,result.modelActive?1:0,result.score,result.featureCount,result.requiredFeatureCount,JSON.stringify(result.reasons),JSON.stringify(result.missing),JSON.stringify(result.features??{}),now],
  });
}

