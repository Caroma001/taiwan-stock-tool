import { createHash } from "node:crypto";
import { TursoDatabaseAdapter } from "@/adapters/turso";
import { getTursoClient } from "@/lib/turso";
import type { DatabaseAdapter, DatabaseRow } from "@/lib/database";
import { MigrationRunner } from "@/migrations/database/MigrationRunner";
import { tursoMigrations } from "@/migrations/turso";
import { getInstitutionalStealthCandidates } from "@/lib/institutional-stealth/service";
import { readSmartSelection } from "@/lib/smart-selection/service";
import { refreshSwing10ExitAlerts } from "@/lib/swing10/trade-execution";
import { evaluateSwing10Opportunity, swing10MarketPosture, type Swing10OpportunityGrade } from "@/lib/swing10/opportunity-grade";

const VERSION = "M8.11.8";
const SNAPSHOT_LIMIT = 20;
const A_GRADE_LIMIT = 5;
const clamp = (v:number,lo=0,hi=100)=>Math.max(lo,Math.min(hi,v));
const round = (v:number,d=1)=>Number(v.toFixed(d));
const n = (v:unknown, fallback=0)=>Number.isFinite(Number(v))?Number(v):fallback;
const nullable = (v:unknown)=>v==null || !Number.isFinite(Number(v)) ? null : Number(v);
const jsonArray = (v:unknown):string[]=>{try{const p=Array.isArray(v)?v:JSON.parse(String(v??"[]"));return Array.isArray(p)?p.map(String):[];}catch{return [];}};
const marks=(count:number)=>Array.from({length:count},()=>"?").join(",");

export type Swing10Grade = Swing10OpportunityGrade;
export type Swing10RiskLevel = "stable" | "improving" | "watch" | "high";

export type Swing10Candidate = {
  tradeDate:string;
  symbol:string;
  stockName:string;
  rank:number;
  grade:Swing10Grade;
  swing10Score:number;
  decisionScore:number;
  potentialScore:number;
  stealthScore:number|null;
  breakoutScore:number|null;
  triggerScore:number|null;
  decisionDelta1d:number|null;
  decisionDelta3d:number|null;
  rankDelta1d:number|null;
  marketRiskLevel:string;
  marketRiskScore:number|null;
  marketRiskDelta1d:number|null;
  marginWashoutScore:number|null;
  marginWashoutDelta1d:number|null;
  foreignPersistenceScore:number|null;
  foreignPersistenceDelta1d:number|null;
  daytradeRatioPct:number|null;
  daytradeNoisePenalty:number|null;
  daytradeNoiseDelta1d:number|null;
  riskDataConfidencePct:number|null;
  price20Pct:number|null;
  entryGatePass:boolean;
  riskChangeLevel:Swing10RiskLevel;
  riskChanges:string[];
  reasons:string[];
  latestClose?:number|null;
  latestPriceDate?:string|null;
};

async function database(migrate=true){
  const db=new TursoDatabaseAdapter(getTursoClient());
  if(migrate) await new MigrationRunner(db,tursoMigrations).migrate();
  return db;
}

function riskLevelRank(value:unknown){
  const s=String(value??"");
  if(s==="高") return 4;
  if(s==="中高") return 3;
  if(s==="中低") return 2;
  if(s==="低") return 1;
  return 0;
}

function historyRow(row:DatabaseRow|undefined){
  if(!row) return null;
  return {
    rank:n(row.candidate_rank), decision:nullable(row.decision_score),
    marketRisk:nullable(row.market_risk_score), margin:nullable(row.margin_washout_score),
    persistence:nullable(row.foreign_persistence_score), noise:nullable(row.daytrade_noise_penalty),
    marketRiskLevel:String(row.market_risk_level??""),
  };
}

function delta(current:number|null, previous:number|null){
  return current==null || previous==null ? null : round(current-previous,1);
}

function riskChanges(input:{
  current:{decision:number;marketRisk:number|null;marketRiskLevel:string;margin:number|null;persistence:number|null;noise:number|null};
  previous:ReturnType<typeof historyRow>;
}){
  const previous=input.previous;
  const changes:string[]=[];
  if(!previous) return {level:"stable" as Swing10RiskLevel,changes:["首次建立 Swing10 基準"],decisionDelta:null,marketRiskDelta:null,marginDelta:null,persistenceDelta:null,noiseDelta:null};
  const decisionDelta=delta(input.current.decision,previous.decision);
  const marketRiskDelta=delta(input.current.marketRisk,previous.marketRisk);
  const marginDelta=delta(input.current.margin,previous.margin);
  const persistenceDelta=delta(input.current.persistence,previous.persistence);
  const noiseDelta=delta(input.current.noise,previous.noise);

  let severity=0, positive=0;
  if(riskLevelRank(input.current.marketRiskLevel)>riskLevelRank(previous.marketRiskLevel) || (marketRiskDelta??0)>=10){changes.push("大盤風險升高");severity+=2;}
  if((persistenceDelta??0)<=-12){changes.push("外資續航轉弱");severity+=2;}
  if((noiseDelta??0)>=3){changes.push("當沖雜訊升高");severity+=2;}
  if((marginDelta??0)<=-15){changes.push("融資籌碼轉弱");severity+=1;}
  if((decisionDelta??0)<=-3){changes.push("決策分轉弱");severity+=2;}

  if((decisionDelta??0)>=3){changes.push("決策分改善");positive+=1;}
  if((persistenceDelta??0)>=12){changes.push("外資續航改善");positive+=1;}
  if((noiseDelta??0)<=-3){changes.push("當沖雜訊下降");positive+=1;}
  if((marginDelta??0)>=15){changes.push("融資清洗改善");positive+=1;}
  if(!changes.length) changes.push("主要風險穩定");
  const level:Swing10RiskLevel=severity>=3?"high":severity>0?"watch":positive>0?"improving":"stable";
  return {level,changes,decisionDelta,marketRiskDelta,marginDelta,persistenceDelta,noiseDelta};
}

async function priorDateMaps(db:DatabaseAdapter,tradeDate:string,symbols:string[]){
  if(!symbols.length) return {previous:new Map<string,DatabaseRow>(),third:new Map<string,DatabaseRow>(),dates:[] as string[]};
  const dateRows=await db.execute<DatabaseRow>({
    sql:"SELECT DISTINCT trade_date FROM swing10_candidate_daily WHERE trade_date<? ORDER BY trade_date DESC LIMIT 3",
    args:[tradeDate],
  });
  const dates=dateRows.rows.map(r=>String(r.trade_date)).filter(Boolean);
  const previous=new Map<string,DatabaseRow>(), third=new Map<string,DatabaseRow>();
  if(!dates.length) return {previous,third,dates};
  const rows=await db.execute<DatabaseRow>({
    sql:`SELECT * FROM swing10_candidate_daily WHERE trade_date IN (${marks(dates.length)}) AND symbol IN (${marks(symbols.length)})`,
    args:[...dates,...symbols],
  });
  const latestDate=dates[0], thirdDate=dates[Math.min(2,dates.length-1)];
  for(const row of rows.rows){
    const symbol=String(row.symbol),date=String(row.trade_date);
    if(date===latestDate) previous.set(symbol,row);
    if(date===thirdDate) third.set(symbol,row);
  }
  return {previous,third,dates};
}

export async function refreshSwing10DailySnapshot(db:DatabaseAdapter,tradeDate:string,candidateSymbols?:string[]){
  const symbols=(candidateSymbols?.length?candidateSymbols:await getInstitutionalStealthCandidates(40)).slice(0,40);
  if(!symbols.length) return {ok:true,tradeDate,total:0,aGradeCount:0,riskChangedCount:0,rows:[] as Swing10Candidate[]};
  const selection=await readSmartSelection(40,symbols);
  const sourceRows=[...(selection.rows as any[])];
  const history=await priorDateMaps(db,tradeDate,sourceRows.map(r=>String(r.symbol)));

  const provisional=sourceRows.map((row:any,index:number)=>{
    const symbol=String(row.symbol);
    const previous=historyRow(history.previous.get(symbol));
    const third=historyRow(history.third.get(symbol));
    const risk=row.riskOverlay??null;
    const decision=round(n(row.decisionScore??row.potentialScore),1);
    const current={
      decision,
      marketRisk:nullable(risk?.marketRiskScore),marketRiskLevel:String(risk?.marketRiskLevel??"待補"),
      margin:nullable(risk?.marginWashoutScore),persistence:nullable(risk?.foreignPersistenceScore),noise:nullable(risk?.daytradeNoisePenalty),
    };
    const riskChange=riskChanges({current,previous});
    const decisionDelta3d=third?.decision==null?null:delta(decision,third.decision);
    const grade=evaluateSwing10Opportunity({
      decision,stealth:nullable(row.stealthScore),breakout:nullable(row.breakoutScore),trigger:nullable(row.stealthComponents?.trigger),
      persistence:current.persistence,daytradePenalty:current.noise,daytradeRatio:nullable(risk?.daytradeRatioPct),
      marketRisk:current.marketRiskLevel,marketRiskScore:current.marketRisk,confidence:nullable(risk?.dataConfidencePct),margin:current.margin,
      price20:nullable(row.price20Pct),decisionDelta1d:riskChange.decisionDelta,decisionDelta3d,hasPrevious:Boolean(previous),
    });
    const gradeReasons=grade.reasons;
    return {
      tradeDate,symbol,stockName:String(row.stockName??row.name??""),provisionalRank:index+1,
      grade:grade.grade,swing10Score:grade.swing10Score,decisionScore:decision,potentialScore:round(n(row.potentialScore),1),
      stealthScore:nullable(row.stealthScore),breakoutScore:nullable(row.breakoutScore),triggerScore:nullable(row.stealthComponents?.trigger),
      decisionDelta1d:riskChange.decisionDelta,decisionDelta3d,previousRank:previous?.rank??null,
      marketRiskLevel:current.marketRiskLevel,marketRiskScore:current.marketRisk,marketRiskDelta1d:riskChange.marketRiskDelta,
      marginWashoutScore:current.margin,marginWashoutDelta1d:riskChange.marginDelta,
      foreignPersistenceScore:current.persistence,foreignPersistenceDelta1d:riskChange.persistenceDelta,
      daytradeRatioPct:nullable(risk?.daytradeRatioPct),daytradeNoisePenalty:current.noise,daytradeNoiseDelta1d:riskChange.noiseDelta,
      riskDataConfidencePct:nullable(risk?.dataConfidencePct),price20Pct:nullable(row.price20Pct),entryGatePass:grade.entryGatePass,
      riskChangeLevel:riskChange.level,riskChanges:riskChange.changes,reasons:gradeReasons,
    };
  });

  provisional.sort((a,b)=>b.swing10Score-a.swing10Score || b.decisionScore-a.decisionScore || a.symbol.localeCompare(b.symbol));
  let acceptedA=0;
  const rows:Swing10Candidate[]=provisional.slice(0,SNAPSHOT_LIMIT).map((row,index)=>{
    let grade=row.grade;
    if(grade==="A1"||grade==="A0"){
      acceptedA+=1;
      if(acceptedA>A_GRADE_LIMIT) grade="B+";
    }
    const rank=index+1;
    return {...row,rank,grade,entryGatePass:grade==="A1",rankDelta1d:row.previousRank==null?null:Number(row.previousRank)-rank};
  });

  const now=new Date().toISOString();
  // A same-day rebuild may change the Top20. Remove stale rows first so the
  // table remains strictly bounded to <=20 rows/trading day.
  if(rows.length){
    await db.execute({
      sql:`DELETE FROM swing10_candidate_daily WHERE trade_date=? AND symbol NOT IN (${marks(rows.length)})`,
      args:[tradeDate,...rows.map(row=>row.symbol)],
    });
  } else {
    await db.execute({sql:"DELETE FROM swing10_candidate_daily WHERE trade_date=?",args:[tradeDate]});
  }
  await db.executeMany(rows.map(row=>({
    sql:`INSERT INTO swing10_candidate_daily(
      trade_date,symbol,stock_name,candidate_rank,grade,swing10_score,decision_score,potential_score,stealth_score,breakout_score,trigger_score,
      decision_delta_1d,decision_delta_3d,rank_delta_1d,market_risk_level,market_risk_score,market_risk_delta_1d,
      margin_washout_score,margin_washout_delta_1d,foreign_persistence_score,foreign_persistence_delta_1d,
      daytrade_ratio_pct,daytrade_noise_penalty,daytrade_noise_delta_1d,risk_data_confidence_pct,price20_pct,
      entry_gate_pass,risk_change_level,risk_change_json,reasons_json,created_at,updated_at
    ) VALUES(${Array.from({length:32},()=>"?").join(",")})
    ON CONFLICT(trade_date,symbol) DO UPDATE SET
      stock_name=excluded.stock_name,candidate_rank=excluded.candidate_rank,grade=excluded.grade,swing10_score=excluded.swing10_score,
      decision_score=excluded.decision_score,potential_score=excluded.potential_score,stealth_score=excluded.stealth_score,breakout_score=excluded.breakout_score,
      trigger_score=excluded.trigger_score,decision_delta_1d=excluded.decision_delta_1d,decision_delta_3d=excluded.decision_delta_3d,rank_delta_1d=excluded.rank_delta_1d,
      market_risk_level=excluded.market_risk_level,market_risk_score=excluded.market_risk_score,market_risk_delta_1d=excluded.market_risk_delta_1d,
      margin_washout_score=excluded.margin_washout_score,margin_washout_delta_1d=excluded.margin_washout_delta_1d,
      foreign_persistence_score=excluded.foreign_persistence_score,foreign_persistence_delta_1d=excluded.foreign_persistence_delta_1d,
      daytrade_ratio_pct=excluded.daytrade_ratio_pct,daytrade_noise_penalty=excluded.daytrade_noise_penalty,daytrade_noise_delta_1d=excluded.daytrade_noise_delta_1d,
      risk_data_confidence_pct=excluded.risk_data_confidence_pct,price20_pct=excluded.price20_pct,entry_gate_pass=excluded.entry_gate_pass,
      risk_change_level=excluded.risk_change_level,risk_change_json=excluded.risk_change_json,reasons_json=excluded.reasons_json,updated_at=excluded.updated_at`,
    args:[row.tradeDate,row.symbol,row.stockName,row.rank,row.grade,row.swing10Score,row.decisionScore,row.potentialScore,row.stealthScore,row.breakoutScore,row.triggerScore,
      row.decisionDelta1d,row.decisionDelta3d,row.rankDelta1d,row.marketRiskLevel,row.marketRiskScore,row.marketRiskDelta1d,row.marginWashoutScore,row.marginWashoutDelta1d,
      row.foreignPersistenceScore,row.foreignPersistenceDelta1d,row.daytradeRatioPct,row.daytradeNoisePenalty,row.daytradeNoiseDelta1d,row.riskDataConfidencePct,row.price20Pct,
      row.entryGatePass?1:0,row.riskChangeLevel,JSON.stringify(row.riskChanges),JSON.stringify(row.reasons),now,now],
  })));

  const aGradeCount=rows.filter(r=>r.grade==="A1"||r.grade==="A0").length;
  const riskChangedCount=rows.filter(r=>r.riskChangeLevel==="watch" || r.riskChangeLevel==="high").length;
  const fingerprint=createHash("sha256").update(JSON.stringify(rows.map(r=>[r.symbol,r.grade,r.swing10Score,r.riskChangeLevel]))).digest("hex").slice(0,24);
  await db.execute({
    sql:`INSERT INTO swing10_daily_review(trade_date,snapshot_status,candidate_count,a_grade_count,risk_changed_count,snapshot_fingerprint,reviewed,reviewed_at,note,created_at,updated_at)
         VALUES(?,?,?,?,?,?,0,NULL,NULL,?,?)
         ON CONFLICT(trade_date) DO UPDATE SET
           snapshot_status='ready',candidate_count=excluded.candidate_count,a_grade_count=excluded.a_grade_count,risk_changed_count=excluded.risk_changed_count,
           reviewed=CASE WHEN COALESCE(swing10_daily_review.snapshot_fingerprint,'')<>excluded.snapshot_fingerprint THEN 0 ELSE swing10_daily_review.reviewed END,
           reviewed_at=CASE WHEN COALESCE(swing10_daily_review.snapshot_fingerprint,'')<>excluded.snapshot_fingerprint THEN NULL ELSE swing10_daily_review.reviewed_at END,
           snapshot_fingerprint=excluded.snapshot_fingerprint,updated_at=excluded.updated_at`,
    args:[tradeDate,"ready",rows.length,aGradeCount,riskChangedCount,fingerprint,now,now],
  });
  const exitAlerts=await refreshSwing10ExitAlerts(db,tradeDate).catch(error=>({ok:false,tradeDate,total:0,hold:0,watch:0,sellCheck:0,error:error instanceof Error?error.message:String(error)}));
  return {ok:true,version:VERSION,tradeDate,total:rows.length,aGradeCount,riskChangedCount,rows,exitAlerts};
}

export async function refreshSwing10DailySnapshotWithMigration(tradeDate?:string){
  const db=await database(true);
  let date=tradeDate;
  if(!date){
    const row=await db.execute<DatabaseRow>({sql:"SELECT MAX(trade_date) AS trade_date FROM risk_intelligence_latest"});
    date=String(row.rows[0]?.trade_date??"");
  }
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date??""))) throw new Error("找不到有效風險情報交易日，請先完成每日一鍵更新。");
  return refreshSwing10DailySnapshot(db,String(date));
}

export async function readSwing10Dashboard(){
  const db=await database(true);
  const latest=await db.execute<DatabaseRow>({sql:"SELECT MAX(trade_date) AS trade_date FROM swing10_candidate_daily"});
  const tradeDate=String(latest.rows[0]?.trade_date??"");
  if(!tradeDate) return {ok:true,version:VERSION,tradeDate:null,summary:{candidateCount:0,aGradeCount:0,riskChangedCount:0,reviewed:false},rows:[] as Swing10Candidate[]};
  const [rowsResult,reviewResult,recentAResult]=await Promise.all([
    db.execute<DatabaseRow>({sql:"SELECT sc.*,i.close AS latest_close,i.trade_date AS latest_price_date FROM swing10_candidate_daily sc LEFT JOIN indicator_latest i ON i.symbol=sc.symbol WHERE sc.trade_date=? ORDER BY sc.candidate_rank ASC",args:[tradeDate]}),
    db.execute<DatabaseRow>({sql:"SELECT * FROM swing10_daily_review WHERE trade_date=? LIMIT 1",args:[tradeDate]}),
    db.execute<DatabaseRow>({sql:`WITH recent_dates AS (
      SELECT DISTINCT trade_date FROM swing10_candidate_daily ORDER BY trade_date DESC LIMIT 10
    )
    SELECT symbol,MAX(stock_name) AS stock_name,MIN(trade_date) AS first_a_date,MAX(trade_date) AS last_a_date,
           COUNT(*) AS a_days,MAX(CASE WHEN trade_date=? THEN 1 ELSE 0 END) AS is_current_a
    FROM swing10_candidate_daily
    WHERE trade_date IN (SELECT trade_date FROM recent_dates) AND grade IN ('A1','A0')
    GROUP BY symbol ORDER BY last_a_date DESC,a_days DESC,symbol`,args:[tradeDate]}),
  ]);
  const rows=rowsResult.rows.map(row=>({
    tradeDate:String(row.trade_date),symbol:String(row.symbol),stockName:String(row.stock_name??""),rank:n(row.candidate_rank),grade:String(row.grade) as Swing10Grade,
    swing10Score:n(row.swing10_score),decisionScore:n(row.decision_score),potentialScore:n(row.potential_score),stealthScore:nullable(row.stealth_score),breakoutScore:nullable(row.breakout_score),triggerScore:nullable(row.trigger_score),
    decisionDelta1d:nullable(row.decision_delta_1d),decisionDelta3d:nullable(row.decision_delta_3d),rankDelta1d:row.rank_delta_1d==null?null:n(row.rank_delta_1d),
    marketRiskLevel:String(row.market_risk_level??"待補"),marketRiskScore:nullable(row.market_risk_score),marketRiskDelta1d:nullable(row.market_risk_delta_1d),
    marginWashoutScore:nullable(row.margin_washout_score),marginWashoutDelta1d:nullable(row.margin_washout_delta_1d),foreignPersistenceScore:nullable(row.foreign_persistence_score),foreignPersistenceDelta1d:nullable(row.foreign_persistence_delta_1d),
    daytradeRatioPct:nullable(row.daytrade_ratio_pct),daytradeNoisePenalty:nullable(row.daytrade_noise_penalty),daytradeNoiseDelta1d:nullable(row.daytrade_noise_delta_1d),riskDataConfidencePct:nullable(row.risk_data_confidence_pct),price20Pct:nullable(row.price20_pct),
    entryGatePass:Boolean(n(row.entry_gate_pass)),riskChangeLevel:String(row.risk_change_level??"stable") as Swing10RiskLevel,riskChanges:jsonArray(row.risk_change_json),reasons:jsonArray(row.reasons_json),
    latestClose:nullable(row.latest_close),latestPriceDate:row.latest_price_date==null?null:String(row.latest_price_date),
    marketPosture:swing10MarketPosture(String(row.market_risk_level??"待補"),nullable(row.market_risk_score)),
  }));
  const review=reviewResult.rows[0];
  const recentA=recentAResult.rows.map(row=>({
    symbol:String(row.symbol),stockName:String(row.stock_name??""),firstADate:String(row.first_a_date??""),lastADate:String(row.last_a_date??""),
    aDays:n(row.a_days),currentA:Boolean(n(row.is_current_a)),status:Boolean(n(row.is_current_a))?"A級機會持續":"已退出目前A級機會",
  }));
  return {ok:true,version:VERSION,tradeDate,summary:{candidateCount:rows.length,aGradeCount:rows.filter(r=>r.grade==="A1"||r.grade==="A0").length,a1Count:rows.filter(r=>r.grade==="A1").length,a0Count:rows.filter(r=>r.grade==="A0").length,riskChangedCount:rows.filter(r=>r.riskChangeLevel==="watch"||r.riskChangeLevel==="high").length,reviewed:Boolean(n(review?.reviewed)),reviewedAt:review?.reviewed_at==null?null:String(review.reviewed_at)},rows,recentA};
}

export async function markSwing10Reviewed(tradeDate:string,note?:string){
  const db=await database(true);
  const now=new Date().toISOString();
  const result=await db.execute({
    sql:"UPDATE swing10_daily_review SET reviewed=1,reviewed_at=?,note=?,updated_at=? WHERE trade_date=?",
    args:[now,note?.trim()||null,now,tradeDate],
  });
  return {ok:true,tradeDate,reviewed:result.rowsAffected>0,reviewedAt:now};
}
