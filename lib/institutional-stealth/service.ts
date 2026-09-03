import { TursoDatabaseAdapter } from "@/adapters/turso";
import { getTursoClient } from "@/lib/turso";
import { MigrationRunner } from "@/migrations/database/MigrationRunner";
import { tursoMigrations } from "@/migrations/turso";
import type { DatabaseAdapter, DatabaseRow } from "@/lib/database";
import { calculateBreakoutScoreForSymbol, loadWinner25LiveModel, persistLiveBreakoutScore, type Winner25LiveModel } from "@/lib/winner25/service";
import type { Winner25Features } from "@/lib/winner25/features";

const clamp = (v:number, lo=0, hi=100) => Math.max(lo, Math.min(hi, v));
const round = (v:number,d=1) => Number(v.toFixed(d));
const map = (v:number, lo:number, hi:number) => hi===lo ? 50 : clamp(((v-lo)/(hi-lo))*100);

function weightedAvailable(pairs:Array<[number|null,number]>) {
  const valid=pairs.filter(([v])=>v!=null && Number.isFinite(v)) as Array<[number,number]>;
  if(!valid.length) return null;
  const w=valid.reduce((s,[,weight])=>s+weight,0)||1;
  return valid.reduce((s,[v,weight])=>s+v*weight,0)/w;
}

const triangular = (v:number|null, idealLo:number, idealHi:number, outerLo:number, outerHi:number) => {
  if(v==null) return null;
  if(v>=idealLo && v<=idealHi) return 100;
  if(v<=outerLo || v>=outerHi) return 0;
  if(v<idealLo) return map(v,outerLo,idealLo);
  return 100-map(v,idealHi,outerHi);
};

export type InstitutionalStealthResult = {
  score:number|null;
  foreignScore:number|null;
  trustScore:number|null;
  pullbackScore:number|null;
  ownershipScore:number|null;
  triggerScore:number|null;
  confidencePct:number;
  stage:string;
  reasons:string[];
  missingData:string[];
  coreMissingData:string[];
  auxiliaryMissingData:string[];
  coreReady:boolean;
  breakoutScore:number|null;
  breakoutModelActive:boolean;
  breakoutModelRunId:string|null;
  breakoutReasons:string[];
  features?:Winner25Features;
};

function feature(features:Winner25Features|undefined,key:string){
  const v=features?.[key]; return v==null || !Number.isFinite(Number(v)) ? null : Number(v);
}

export function calculateInstitutionalStealthFromFeatures(
  features: Winner25Features | undefined,
  breakoutScore:number|null,
  breakoutModelActive:boolean,
  breakoutModelRunId:string|null,
  breakoutReasons:string[] = [],
): InstitutionalStealthResult {
  if(!features) return {
    score:null,foreignScore:null,trustScore:null,pullbackScore:null,ownershipScore:null,triggerScore:null,
    confidencePct:0,stage:"資料不足",reasons:["缺少即時歷史特徵"],missingData:["歷史價格/特徵"],
    coreMissingData:["歷史價格/特徵"],auxiliaryMissingData:[],coreReady:false,
    breakoutScore,breakoutModelActive,breakoutModelRunId,breakoutReasons,
  };

  const f20=feature(features,"foreign20AdvPct"), f5=feature(features,"foreign5AdvPct");
  const fhChange=feature(features,"foreignHolding20dChange");
  const ma60=feature(features,"ma60Slope10Pct"), ma20=feature(features,"ma20Slope5Pct");
  const ret5=feature(features,"ret5"), dist20=feature(features,"distanceTo20HighPct"), vs20=feature(features,"closeVsMa20Pct");
  const range20=feature(features,"range20Pct"), vol20=feature(features,"volatility20Pct");
  const volumeNow=feature(features,"volumeTodayOver20"), ret10=feature(features,"ret10");

  // M8.10.4.1：核心資料只要求「價格特徵 + 外資5/20日相對成交量」。
  // 投信、外資持股、TDCC 大戶/散戶屬於輔助資料，缺少時動態重配權重，而不是整檔不計分。
  const priceCoreReady=[ma60,ma20,ret5,dist20,vs20].filter(v=>v!=null).length>=4;
  const foreignCoreReady=f20!=null && f5!=null;
  const coreReady=priceCoreReady && foreignCoreReady;

  // M8.10.23: one completeness source of truth.
  // Core gaps can block the official stealth score. Auxiliary gaps reduce
  // confidence / component coverage but NEVER force score=null by themselves.
  const coreMissingData:string[]=[];
  const auxiliaryMissingData:string[]=[];
  if(f20==null) coreMissingData.push("外資20日/ADV");
  if(f5==null) coreMissingData.push("外資5日/ADV");

  const priceCoreValues=[
    ["MA60斜率",ma60],["MA20斜率",ma20],["前5日漲跌",ret5],
    ["距20日高點",dist20],["收盤相對MA20",vs20],
  ] as const;
  const pricePresent=priceCoreValues.filter(([,v])=>v!=null).length;
  if(pricePresent<4){
    for(const [label,value] of priceCoreValues) if(value==null) coreMissingData.push(label);
  } else {
    for(const [label,value] of priceCoreValues) if(value==null) auxiliaryMissingData.push(label);
  }

  const foreignFlow=f20==null?null:map(f20,-8,30);
  const foreignAccel=(f20!=null&&f5!=null) ? map((f5/5)-(f20/20),-1.0,2.0) : null;
  const foreignHolding=fhChange==null?null:map(fhChange,-0.5,1.0);
  const foreignRaw=weightedAvailable([[foreignFlow,0.60],[foreignAccel,0.25],[foreignHolding,0.15]]);
  const foreignScore=foreignRaw==null?null:round(foreignRaw);

  const t5=feature(features,"trust5AdvPct"), t10=feature(features,"trust10AdvPct"), t20=feature(features,"trust20AdvPct");
  if(t5==null) auxiliaryMissingData.push("投信5日/ADV");
  if(t10==null) auxiliaryMissingData.push("投信10日/ADV");
  if(t20==null) auxiliaryMissingData.push("投信20日/ADV");
  const trustFlow=t10==null?null:map(t10,-5,18);
  const trustAccel=(t20!=null&&t5!=null)?map((t5/5)-(t20/20),-0.7,1.5):null;
  const trustTurn=(t20!=null&&t5!=null)?((t20<=0&&t5>0)?100:(t5>0?70:25)):null;
  const trustRaw=weightedAvailable([[trustFlow,0.50],[trustAccel,0.35],[trustTurn,0.15]]);
  const trustScore=trustRaw==null?null:round(trustRaw);

  const midTrend=weightedAvailable([[ma60==null?null:map(ma60,-0.5,2.0),0.55],[ma20==null?null:map(ma20,-0.8,2.0),0.45]]);
  const pullbackBand=weightedAvailable([[triangular(ret5,-9,-3,-16,4),0.35],[triangular(dist20,-18,-8,-30,1),0.35],[triangular(vs20,-7,0,-14,5),0.30]]);
  const activeRange=weightedAvailable([[range20==null?null:map(range20,8,24),0.55],[vol20==null?null:map(vol20,1.2,4.2),0.45]]);
  const pullbackRaw=weightedAvailable([[midTrend,0.40],[pullbackBand,0.40],[activeRange,0.20]]);
  const pullbackScore=pullbackRaw==null?null:round(pullbackRaw);

  const largeCh=feature(features,"largeHolder4wChange"), retailCh=feature(features,"retail4wChange");
  if(fhChange==null) auxiliaryMissingData.push("外資持股20日變化");
  if(largeCh==null) auxiliaryMissingData.push("大戶4週變化");
  if(retailCh==null) auxiliaryMissingData.push("散戶4週變化");
  const ownershipRaw=weightedAvailable([
    [fhChange==null?null:map(fhChange,-0.4,0.8),0.35],
    [largeCh==null?null:map(largeCh,-1.0,2.0),0.40],
    [retailCh==null?null:map(-retailCh,-1.0,2.0),0.25],
  ]);
  const ownershipScore=ownershipRaw==null?null:round(ownershipRaw);

  if(volumeNow==null) auxiliaryMissingData.push("當日量/20日均量");
  const reclaim=vs20==null?null:triangular(vs20,-1.5,3.0,-8,8);
  const triggerRaw=weightedAvailable([
    [volumeNow==null?null:map(volumeNow,0.7,1.8),0.30],
    [ma20==null?null:map(ma20,-0.3,1.8),0.25],
    [reclaim,0.25],
    [ret5==null?null:map(ret5,-4,5),0.10],
    [ret10==null?null:map(ret10,-8,8),0.10],
  ]);
  const triggerScore=triggerRaw==null?null:round(triggerRaw);

  const allObserved=[f20,f5,fhChange,t5,t10,t20,ma60,ma20,ret5,dist20,vs20,range20,vol20,largeCh,retailCh,volumeNow,ret10];
  const confidencePct=round(allObserved.filter(v=>v!=null).length/allObserved.length*100,0);
  const missingData=[...new Set([...coreMissingData,...auxiliaryMissingData])];

  // 動態權重：缺少輔助資料時，把權重重新分配給已有構面；核心資料不完整則不產生正式潛伏分。
  const dynamicScore=coreReady ? weightedAvailable([
    [foreignScore,0.30],
    [trustScore,0.20],
    [pullbackScore,0.20],
    [ownershipScore,0.15],
    [triggerScore,0.15],
  ]) : null;
  const score=dynamicScore==null?null:round(dynamicScore);

  let stage="資料不足";
  if(score!=null){
    stage="等待";
    if(score>=80 && (triggerScore??0)>=70 && (breakoutScore??0)>=60) stage="發動初期";
    else if((foreignScore??0)>=70 && (trustScore??0)>=62 && (pullbackScore??0)>=58 && (triggerScore??0)<70) stage="法人潛伏";
    else if((pullbackScore??0)>=72 && ((foreignScore??0)>=58 || (trustScore??0)>=58)) stage="回檔布局";
    else if(score>=65) stage="資金觀察";
  }

  const reasons:string[]=[];
  if((foreignScore??0)>=70) reasons.push(`外資潛伏 ${(foreignScore??0).toFixed(0)}/100`);
  if((trustScore??0)>=65) reasons.push(`投信接棒 ${(trustScore??0).toFixed(0)}/100`);
  if((pullbackScore??0)>=70) reasons.push(`強勢回檔 ${(pullbackScore??0).toFixed(0)}/100`);
  if((ownershipScore??0)>=65) reasons.push(`籌碼集中 ${(ownershipScore??0).toFixed(0)}/100`);
  if((triggerScore??0)>=70) reasons.push(`發動確認 ${(triggerScore??0).toFixed(0)}/100`);
  if(f20!=null) reasons.push(`外資20日/ADV ${f20.toFixed(1)}%`);
  if(t10!=null) reasons.push(`投信10日/ADV ${t10.toFixed(1)}%`);
  if(!coreReady) reasons.push(`核心資料不足：${coreMissingData.length?coreMissingData.join("、"):"需價格特徵＋外資5/20日相對成交量"}`);
  if(coreReady && auxiliaryMissingData.length) reasons.push(`輔助資料缺口：${auxiliaryMissingData.slice(0,4).join("、")}${auxiliaryMissingData.length>4?"…":""}`);
  if(!coreReady && missingData.length) reasons.push(`缺：${missingData.slice(0,4).join("、")}${missingData.length>4?"…":""}`);

  return {
    score,foreignScore,trustScore,pullbackScore,ownershipScore,triggerScore,confidencePct,stage,
    reasons:reasons.slice(0,10),missingData:[...new Set(missingData)],
    coreMissingData:[...new Set(coreMissingData)],auxiliaryMissingData:[...new Set(auxiliaryMissingData)],coreReady,
    breakoutScore,breakoutModelActive,breakoutModelRunId,breakoutReasons,features,
  };
}

export async function calculateInstitutionalStealthForSymbol(
  db:DatabaseAdapter,
  symbol:string,
  asOfDate?:string,
  model?:Winner25LiveModel,
) {
  const breakout=await calculateBreakoutScoreForSymbol(db,symbol,asOfDate,model);
  await persistLiveBreakoutScore(db,symbol,breakout);
  return calculateInstitutionalStealthFromFeatures(
    breakout.features,
    breakout.score,
    breakout.modelActive,
    breakout.modelRunId,
    breakout.reasons,
  );
}

async function database(){
  const db=new TursoDatabaseAdapter(getTursoClient());
  await new MigrationRunner(db,tursoMigrations).migrate();
  return db;
}

export async function persistLiveInstitutionalStealth(db:DatabaseAdapter,symbol:string,result:InstitutionalStealthResult){
  const now=new Date().toISOString();
  // winner25_live_scores row is created by persistLiveBreakoutScore immediately before this call.
  await db.execute({
    sql:`UPDATE winner25_live_scores SET
      stealth_score=?,stealth_foreign_score=?,stealth_trust_score=?,stealth_pullback_score=?,stealth_ownership_score=?,stealth_trigger_score=?,
      stealth_confidence_pct=?,stealth_stage=?,stealth_reasons_json=?,missing_json=?,calculated_at=?
      WHERE symbol=?`,
    args:[
      result.score,result.foreignScore,result.trustScore,result.pullbackScore,result.ownershipScore,result.triggerScore,
      result.confidencePct,result.stage,JSON.stringify(result.reasons),JSON.stringify(result.missingData),now,symbol,
    ],
  });
}

export async function persistInstitutionalStealth(db:DatabaseAdapter,symbol:string,result:InstitutionalStealthResult){
  const now=new Date().toISOString();
  try {
    await db.execute({
    sql:`UPDATE ai_analysis_latest SET
      breakout_score=?,breakout_model_active=?,breakout_model_run_id=?,breakout_reasons_json=?,
      stealth_score=?,stealth_foreign_score=?,stealth_trust_score=?,stealth_pullback_score=?,stealth_ownership_score=?,stealth_trigger_score=?,stealth_confidence_pct=?,stealth_stage=?,stealth_reasons_json=?,stealth_calculated_at=?
      WHERE symbol=?`,
    args:[
      result.breakoutScore,result.breakoutModelActive?1:0,result.breakoutModelRunId,JSON.stringify(result.breakoutReasons),
      result.score,result.foreignScore,result.trustScore,result.pullbackScore,result.ownershipScore,result.triggerScore,result.confidencePct,result.stage,JSON.stringify(result.reasons),now,symbol,
    ],
    });
  } catch (error) {
    // M8.10.5: ai_analysis_latest is a compatibility mirror only.
    // winner25_live_scores is the source of truth for live scoring, so an old-row
    // constraint must never invalidate a successfully calculated candidate.
    console.warn(`[stealth] ai_analysis_latest mirror skipped for ${symbol}:`, error);
  }
}

export async function getInstitutionalStealthCandidates(limit=40){
  const db=await database();
  const safeLimit=Math.max(1,Math.min(100,Math.floor(limit)||40));
  const rows=await db.execute<DatabaseRow>({
    sql:`SELECT symbol FROM foreign_accumulation_latest
         WHERE data_days>=10
         ORDER BY accumulation_score DESC,buy_days_20 DESC,symbol
         LIMIT ?`,
    args:[safeLimit],
  });
  return [...new Set(rows.rows.map(r=>String(r.symbol)).filter(Boolean))];
}

export type StealthRefreshItem = {
  symbol:string;
  ok:boolean;
  attempts:number;
  breakoutScore:number|null;
  breakoutActive:boolean;
  stealthScore:number|null;
  stage:string;
  confidencePct:number;
  missingData:string[];
  error?:string;
};

export async function refreshInstitutionalStealth(symbols?:string[],limit=40){
  const db=await database();
  let clean=[...new Set((symbols??[]).map(String).filter(Boolean))];
  if(!clean.length){
    const safeLimit=Math.max(1,Math.min(100,Math.floor(limit)||40));
    const rows=await db.execute<DatabaseRow>({
      sql:`SELECT symbol FROM foreign_accumulation_latest
           WHERE data_days>=10
           ORDER BY accumulation_score DESC,buy_days_20 DESC,symbol
           LIMIT ?`,
      args:[safeLimit],
    });
    clean=[...new Set(rows.rows.map(r=>String(r.symbol)).filter(Boolean))];
  }

  // Load the historical Winner25 model once for the whole batch.
  // M8.10.4.2 queried run + rules for every symbol, multiplying Turso calls and
  // making partial coverage much more likely under latency/timeout conditions.
  const model=await loadWinner25LiveModel(db);
  const items:StealthRefreshItem[]=[];

  for(const symbol of clean){
    let lastError="";
    let completed=false;
    for(let attempt=1;attempt<=2 && !completed;attempt++){
      try{
        const breakout=await calculateBreakoutScoreForSymbol(db,symbol,undefined,model);
        await persistLiveBreakoutScore(db,symbol,breakout);
        const calculated=calculateInstitutionalStealthFromFeatures(
          breakout.features,
          breakout.score,
          breakout.modelActive,
          breakout.modelRunId,
          breakout.reasons,
        );
        const unifiedMissing=[...new Set([...(breakout.missing??[]),...(calculated.missingData??[])])];
        const result={...calculated,missingData:unifiedMissing};
        await persistLiveInstitutionalStealth(db,symbol,result);
        await persistInstitutionalStealth(db,symbol,result);
        items.push({
          symbol,ok:true,attempts:attempt,breakoutScore:breakout.score,
          breakoutActive:Boolean(breakout.modelActive && breakout.score!=null),
          stealthScore:result.score,stage:result.stage,confidencePct:result.confidencePct,
          missingData:unifiedMissing.slice(0,12),
        });
        completed=true;
      }catch(error){
        lastError=error instanceof Error?error.message:String(error);
        if(attempt<2) await new Promise(resolve=>setTimeout(resolve,150));
      }
    }
    if(!completed){
      items.push({symbol,ok:false,attempts:2,breakoutScore:null,breakoutActive:false,stealthScore:null,stage:"資料不足",confidencePct:0,missingData:[],error:lastError||"未知錯誤"});
    }
  }

  const success=items.filter(item=>item.ok).length;
  const failed=items.length-success;
  return {
    ok:true,total:clean.length,success,failed,
    breakoutScored:items.filter(item=>item.breakoutScore!=null).length,
    breakoutActive:items.filter(item=>item.breakoutActive).length,
    stealthScored:items.filter(item=>item.stealthScore!=null).length,
    model:{runId:model.runId,active:model.active,ruleCount:model.rules.length,reason:model.reason??null},
    items,
    errors:items.filter(item=>!item.ok).map(item=>({symbol:item.symbol,error:item.error??"更新失敗"})).slice(0,20),
  };
}
