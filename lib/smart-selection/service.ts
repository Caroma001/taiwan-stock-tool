import { TursoDatabaseAdapter } from "@/adapters/turso";
import { getTursoClient } from "@/lib/turso";
import { readForeignRadar, readForeignRadarSymbols } from "@/lib/foreign-accumulation";
import type { DatabaseRow } from "@/lib/database";
import { calculateOwnershipStructureScore } from "@/lib/smart-selection/scoring";

async function database(){ return new TursoDatabaseAdapter(getTursoClient()); }
const n=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0;
const parse=(v:unknown)=>{try{return Array.isArray(v)?v:JSON.parse(String(v??"[]"));}catch{return []}};

export async function readSmartSelection(limit=30, symbolUniverse?:string[]){
  const db=await database();
  const fixedUniverse=symbolUniverse?.length
    ? new Set(symbolUniverse.map(String).filter(Boolean))
    : null;
  const radarRaw=fixedUniverse
    ? await readForeignRadarSymbols([...fixedUniverse])
    : await readForeignRadar(Math.max(limit*3,60), { includeSummary: false });
  // M8.10.5: when a caller supplies a fixed candidate universe, every downstream
  // read (Winner25 live score, stealth score, coverage summary and table rows) must
  // be calculated from exactly the same symbols that were refreshed. Previously
  // the scanner refreshed the top 40 foreign-accumulation names but displayed the
  // top 40 potential-score names drawn from a wider top-120 universe, so the UI
  // could show stale 5/40 even after the refresh pipeline completed 40/40.
  const radar={
    ...radarRaw,
    rows:fixedUniverse
      ? radarRaw.rows.filter((row:any)=>fixedUniverse.has(String(row.symbol)))
      : radarRaw.rows,
  };
  const symbols=radar.rows.map((r:any)=>String(r.symbol));
  const ownership=symbols.length
    ? await db.execute<DatabaseRow>({
        sql:`SELECT * FROM ownership_structure_latest WHERE symbol IN (${symbols.map(()=>"?").join(",")})`,
        args:symbols,
      })
    : { rows: [] as readonly DatabaseRow[], rowsAffected: 0 };
  const map=new Map(ownership.rows.map(r=>[String(r.symbol),r]));
  const breakoutMap=new Map<string,{score:number|null;active:boolean;runId:string|null;reasons:string[];stealthScore:number|null;foreignStealth:number|null;trustRelay:number|null;pullback:number|null;ownershipChange:number|null;trigger:number|null;stealthConfidence:number;stealthStage:string;stealthReasons:string[]}>();
  const liveBreakoutMap=new Map<string,{score:number|null;active:boolean;runId:string|null;reasons:string[];stealthScore:number|null;foreignStealth:number|null;trustRelay:number|null;pullback:number|null;ownershipChange:number|null;trigger:number|null;stealthConfidence:number;stealthStage:string;stealthReasons:string[];asOfDate:string|null;featureCount:number;requiredFeatureCount:number;missing:string[]}>();
  if(symbols.length){
    const result=await db.execute<DatabaseRow>({
      sql:`SELECT symbol,breakout_score,breakout_model_active,breakout_model_run_id,breakout_reasons_json,stealth_score,stealth_foreign_score,stealth_trust_score,stealth_pullback_score,stealth_ownership_score,stealth_trigger_score,stealth_confidence_pct,stealth_stage,stealth_reasons_json FROM ai_analysis_latest WHERE symbol IN (${symbols.map(()=>"?").join(",")})`,
      args:symbols,
    });
    for(const row of result.rows){
      breakoutMap.set(String(row.symbol),{
        score:row.breakout_score==null?null:n(row.breakout_score),
        active:Boolean(n(row.breakout_model_active)),
        runId:row.breakout_model_run_id==null?null:String(row.breakout_model_run_id),
        reasons:parse(row.breakout_reasons_json),
        stealthScore:row.stealth_score==null?null:n(row.stealth_score),
        foreignStealth:row.stealth_foreign_score==null?null:n(row.stealth_foreign_score),
        trustRelay:row.stealth_trust_score==null?null:n(row.stealth_trust_score),
        pullback:row.stealth_pullback_score==null?null:n(row.stealth_pullback_score),
        ownershipChange:row.stealth_ownership_score==null?null:n(row.stealth_ownership_score),
        trigger:row.stealth_trigger_score==null?null:n(row.stealth_trigger_score),
        stealthConfidence:n(row.stealth_confidence_pct),
        stealthStage:String(row.stealth_stage??"資料不足"),
        stealthReasons:parse(row.stealth_reasons_json),
      });
    }
  }
  if(symbols.length){
    const result=await db.execute<DatabaseRow>({
      sql:`SELECT symbol,as_of_date,model_run_id,model_active,breakout_score,feature_count,required_feature_count,reasons_json,missing_json,
                  stealth_score,stealth_foreign_score,stealth_trust_score,stealth_pullback_score,stealth_ownership_score,stealth_trigger_score,stealth_confidence_pct,stealth_stage,stealth_reasons_json
           FROM winner25_live_scores WHERE symbol IN (${symbols.map(()=>"?").join(",")})`,
      args:symbols,
    }).catch(()=>({rows:[],rowsAffected:0} as any));
    for(const row of result.rows){
      liveBreakoutMap.set(String(row.symbol),{
        score:row.breakout_score==null?null:n(row.breakout_score),active:Boolean(n(row.model_active)),runId:row.model_run_id==null?null:String(row.model_run_id),reasons:parse(row.reasons_json),
        stealthScore:row.stealth_score==null?null:n(row.stealth_score),foreignStealth:row.stealth_foreign_score==null?null:n(row.stealth_foreign_score),trustRelay:row.stealth_trust_score==null?null:n(row.stealth_trust_score),pullback:row.stealth_pullback_score==null?null:n(row.stealth_pullback_score),ownershipChange:row.stealth_ownership_score==null?null:n(row.stealth_ownership_score),trigger:row.stealth_trigger_score==null?null:n(row.stealth_trigger_score),stealthConfidence:n(row.stealth_confidence_pct),stealthStage:String(row.stealth_stage??"資料不足"),stealthReasons:parse(row.stealth_reasons_json),
        asOfDate:row.as_of_date==null?null:String(row.as_of_date),featureCount:n(row.feature_count),requiredFeatureCount:n(row.required_feature_count),missing:parse(row.missing_json),
      });
    }
  }
  // M8.10.9: ownership_structure_latest already persists trust 5/10/20 sums.
  // Do not reread the entire institutional_holding_daily history for every
  // Stealth Radar page load merely to keep the newest 20 rows in JavaScript.
  const institutionalMap=new Map<string,{trust5:number|null;trust10:number|null;trust20:number|null;days:number;latestDate:string|null}>();
  for (const symbol of symbols) {
    const o=map.get(symbol);
    if (!o) continue;
    const trust5=o.trust_5==null?null:n(o.trust_5);
    const trust10=o.trust_10==null?null:n(o.trust_10);
    const trust20=o.trust_20==null?null:n(o.trust_20);
    const days=trust20!=null?20:trust10!=null?10:trust5!=null?5:0;
    institutionalMap.set(symbol,{
      trust5,trust10,trust20,days,latestDate:o.data_date==null?null:String(o.data_date),
    });
  }
  const riskRows=symbols.length
    ? await db.execute<DatabaseRow>({
        sql:`SELECT * FROM risk_intelligence_latest WHERE symbol IN (${symbols.map(()=>"?").join(",")})`,
        args:symbols,
      }).catch(()=>({rows:[],rowsAffected:0} as any))
    : {rows:[] as readonly DatabaseRow[],rowsAffected:0};
  // M8.10.25: keep the map value type explicit.  The conditional query/catch
  // branches otherwise let TypeScript infer the Map value as `{}`, which makes
  // every risk_intelligence_latest column fail TS2339 even though DatabaseRow
  // has a string index signature.
  const riskMap=new Map<string,DatabaseRow>();
  for(const row of riskRows.rows as readonly DatabaseRow[]){
    riskMap.set(String(row.symbol),row);
  }
  const tests=await db.execute<{symbol:string}>({sql:`SELECT DISTINCT symbol FROM portfolio_lots WHERE user_name='Bruce' AND holding_type='test' AND status='open' AND remaining_lots>0`});
  const testSet=new Set(tests.rows.map(r=>String(r.symbol)));
  const rows=radar.rows.map((r:any)=>{
    const symbol=String(r.symbol);
    const o=map.get(symbol);
    const inst=institutionalMap.get(symbol);
    const foreignScore=n(r.score);
    const storedOwnershipScore=n(o?.ownership_score);
    const mutedPrice=Math.max(0,100-Math.max(0,n(r.price20Pct))*5);
    const technical=n(r.aiScore);
    const riskScore=n(r.price20Pct)>20?35:n(r.price20Pct)>12?60:85;
    const tags=[...(r.tags??[]),...parse(o?.tags_json)];
    const foreignHoldingPct=o?.foreign_holding_pct==null?null:n(o.foreign_holding_pct);
    const rawLargeHolderPct=o?.large_holder_pct==null?null:n(o.large_holder_pct);
    const rawRetailProxyPct=o?.retail_proxy_pct==null?null:n(o.retail_proxy_pct);
    const distributionValid = Boolean(n(o?.distribution_valid))
      && rawLargeHolderPct != null && rawRetailProxyPct != null
      && rawLargeHolderPct >= 0 && rawLargeHolderPct <= 100
      && rawRetailProxyPct >= 0 && rawRetailProxyPct <= 100
      && Math.abs((rawLargeHolderPct + rawRetailProxyPct) - 100) <= 0.2;
    const largeHolderPct=distributionValid?rawLargeHolderPct:null;
    const retailProxyPct=distributionValid?rawRetailProxyPct:null;
    const trust10=inst?.trust10 ?? (o?.trust_10==null?null:n(o.trust_10));
    const ownershipBreakdown = calculateOwnershipStructureScore({
      foreignHoldingPct,
      largeHolderPct,
      retailPct: retailProxyPct,
      distributionValid,
    });
    // M8.10.2：股權結構 20% 改由外資持股 / 大戶集中 / 散戶反向比例共同決定。
    // storedOwnershipScore 只保留供舊資料追溯，不再主導新排行。
    const ownershipScore = ownershipBreakdown.score;
    const composite=Math.round((foreignScore*.30+ownershipScore*.20+Math.min(100,technical)*.25+mutedPrice*.15+riskScore*.10)*10)/10;
    const breakout=liveBreakoutMap.get(symbol) ?? breakoutMap.get(symbol);
    const breakoutScore=breakout?.score??null;
    const breakoutModelActive=Boolean(breakout?.active && breakoutScore!=null);
    // M8.10.6：Bruce 精選正式退役。舊 composite 只保留為相容/診斷欄位，
    // 正式排名只使用「法人潛伏 + 經 OOS 驗證的 Winner25」。
    const predictionScore=Math.round((breakoutModelActive?n(breakoutScore):0)*10)/10;
    const stealthScore=breakout?.stealthScore??null;
    const stealthConfidence=breakout?.stealthConfidence??0;
    const stealthUsable=stealthScore!=null && stealthConfidence>=35;
    let potentialRaw:number;
    if(stealthUsable && breakoutModelActive) potentialRaw=n(stealthScore)*.65+n(breakoutScore)*.35;
    else if(stealthUsable) potentialRaw=n(stealthScore);
    else if(breakoutModelActive) potentialRaw=n(breakoutScore);
    else potentialRaw=Math.min(55,foreignScore*.55); // 資料不足的股票只能留在候選尾端，不可超越完整潛伏訊號。
    const potentialScore=Math.round(potentialRaw*10)/10;
    const risk=riskMap.get(symbol);
    // M8.10.24 keeps the validated Stealth/Winner25 score intact. Public risk
    // intelligence is a bounded decision overlay, never a model retrain.
    const riskSameDate=Boolean(risk && String(risk.trade_date??"")===String((breakout as any)?.asOfDate??r.tradeDate??radar.summary.latestDate??""));
    const decisionModifier=riskSameDate?n(risk?.decision_modifier):0;
    const decisionScore=Math.round(Math.max(0,Math.min(100,potentialScore+decisionModifier))*10)/10;
    const riskReasons=riskSameDate?parse(risk?.reasons_json):[];
    const riskOverlay=riskSameDate?{
      tradeDate:String(risk?.trade_date??""),decisionModifier,decisionScore,
      marketRiskScore:risk?.market_risk_score==null?null:n(risk.market_risk_score),marketRiskLevel:String(risk?.market_risk_level??"—"),marketRiskModifier:n(risk?.market_risk_modifier),betaProxy:risk?.beta_proxy==null?null:n(risk.beta_proxy),
      marginWashoutScore:risk?.margin_washout_score==null?null:n(risk.margin_washout_score),marginChange1dPct:risk?.margin_change_1d_pct==null?null:n(risk.margin_change_1d_pct),marginChange5dPct:risk?.margin_change_5d_pct==null?null:n(risk.margin_change_5d_pct),marginChange10dPct:risk?.margin_change_10d_pct==null?null:n(risk.margin_change_10d_pct),marginModifier:n(risk?.margin_modifier),
      foreignPersistenceScore:risk?.foreign_persistence_score==null?null:n(risk.foreign_persistence_score),foreign1dShare5dPct:risk?.foreign_1d_share_5d_pct==null?null:n(risk.foreign_1d_share_5d_pct),foreignModifier:n(risk?.foreign_modifier),
      daytradeRatioPct:risk?.daytrade_ratio_pct==null?null:n(risk.daytrade_ratio_pct),daytradeNoisePenalty:n(risk?.daytrade_noise_penalty),dataConfidencePct:n(risk?.data_confidence_pct),reasons:riskReasons,
    }:null;
    const dataStatus={
      price:true,
      foreignFlow:n(r.dataDays)>=10,
      trustFlow:(inst?.days??0)>=10 || o?.trust_10!=null,
      foreignHolding:foreignHoldingPct!=null,
      shareholderDistribution:distributionValid && largeHolderPct!=null && retailProxyPct!=null,
    };
    return {...r,ownership:{
      foreignHoldingPct,
      foreignHoldingChange:o?.foreign_holding_change==null?null:n(o.foreign_holding_change),
      trust5:inst?.trust5 ?? (o?.trust_5==null?null:n(o.trust_5)),
      trust10,
      trust20:inst?.trust20 ?? (o?.trust_20==null?null:n(o.trust_20)),
      institutionalDays:inst?.days??0,
      institutionalLatestDate:inst?.latestDate??null,
      largeHolderPct,
      largeHolderChange:o?.large_holder_change==null?null:n(o.large_holder_change),
      retailProxyPct,
      retailProxyChange:o?.retail_proxy_change==null?null:n(o.retail_proxy_change),
      shareholderCount:o?.shareholder_count==null?null:n(o.shareholder_count),
      shareholderCountChange:o?.shareholder_count_change==null?null:n(o.shareholder_count_change),
      ownershipScore,
      ownershipScoreLegacy: storedOwnershipScore,
      ownershipSubscores: ownershipBreakdown,
      capitalStage:String(o?.capital_stage??"資料不足"),reasons:parse(o?.reasons_json),distributionValid,dataCompletenessPct:o?.data_completeness_pct==null?0:n(o.data_completeness_pct),validationMessage:String(o?.validation_message??"")
    },dataStatus,compositeScore:composite,predictionScore,potentialScore,decisionScore,decisionModifier,riskOverlay,breakoutScore,breakoutModelActive,breakoutModelRunId:breakout?.runId??null,breakoutReasons:breakout?.reasons??[],
      stealthScore,stealthConfidence,stealthStage:breakout?.stealthStage??"資料不足",stealthReasons:breakout?.stealthReasons??[],
      legacyCompositeScore:composite,
      stealthComponents:{foreign:breakout?.foreignStealth??null,trust:breakout?.trustRelay??null,pullback:breakout?.pullback??null,ownership:breakout?.ownershipChange??null,trigger:breakout?.trigger??null},
      breakoutLive:{asOfDate:(breakout as any)?.asOfDate??null,featureCount:(breakout as any)?.featureCount??0,requiredFeatureCount:(breakout as any)?.requiredFeatureCount??0,missing:(breakout as any)?.missing??[]},
      selectionTags:[...new Set([...(tags??[]),...(breakout?.stealthStage && breakout.stealthStage!=="資料不足"?[breakout.stealthStage]:[]),...(riskOverlay?.marginWashoutScore!=null&&riskOverlay.marginWashoutScore>=70?["融資清洗"]:[]),...(riskOverlay?.foreignPersistenceScore!=null&&riskOverlay.foreignPersistenceScore>=70?["外資續航"]:[]),...(n(riskOverlay?.daytradeNoisePenalty)>=7?["當沖雜訊高"]:[]),...(riskOverlay?.marketRiskLevel==="高"?["大盤高風險"]:[])])].slice(0,10),inTestPortfolio:testSet.has(symbol)};
  }).sort((a:any,b:any)=>b.decisionScore-a.decisionScore || b.potentialScore-a.potentialScore || n(b.stealthScore)-n(a.stealthScore) || n(b.breakoutScore)-n(a.breakoutScore) || n(b.score)-n(a.score)).slice(0,limit);
  const coverage={
    price:rows.length,
    foreignFlow:rows.filter((r:any)=>r.dataStatus.foreignFlow).length,
    trustFlow:rows.filter((r:any)=>r.dataStatus.trustFlow).length,
    foreignHolding:rows.filter((r:any)=>r.dataStatus.foreignHolding).length,
    shareholderDistribution:rows.filter((r:any)=>r.dataStatus.shareholderDistribution).length,
    breakoutModel:rows.filter((r:any)=>r.breakoutScore!=null).length,
    breakoutModelActive:rows.filter((r:any)=>r.breakoutModelActive).length,
    stealth:rows.filter((r:any)=>r.stealthScore!=null).length,
    stealthUsable:rows.filter((r:any)=>r.stealthScore!=null && r.stealthConfidence>=35).length,
    stealthLaunch:rows.filter((r:any)=>r.stealthStage==="發動初期").length,
    riskIntelligence:rows.filter((r:any)=>r.riskOverlay!=null).length,
    marginWashout:rows.filter((r:any)=>r.riskOverlay?.marginWashoutScore!=null).length,
    foreignPersistence:rows.filter((r:any)=>r.riskOverlay?.foreignPersistenceScore!=null).length,
    daytradeNoise:rows.filter((r:any)=>r.riskOverlay?.daytradeRatioPct!=null).length,
  };
  return {summary:{total:rows.length,withOwnership:rows.filter((r:any)=>r.ownership.ownershipScore>0).length,foreignLatent:rows.filter((r:any)=>r.score>=65).length,latestDate:radar.summary.latestDate,coverage},rows};
}
