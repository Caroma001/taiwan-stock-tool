import type { DatabaseAdapter, DatabaseRow } from "@/lib/database";
import type { BruceSwingInput, BruceSwingResult } from "./types";

const clamp=(v:number,min=0,max=100)=>Math.max(min,Math.min(max,v));
const r1=(v:number)=>Math.round(v*10)/10;
const has=(v:unknown)=>v!==null&&v!==undefined&&!(typeof v==="string"&&v.trim()==="")&&Number.isFinite(Number(v));
const val=(v:unknown,f=50)=>has(v)?Number(v):f;
const zero=(v:unknown,f=0)=>has(v)?Number(v):f;
const rsFrom20=(v:unknown)=>clamp(50+zero(v,0)*2);

type Availability={margin:boolean;fundamental:boolean;daytrade:boolean;price20:boolean;market:boolean};
type V213Input=BruceSwingInput&{dataQualityScore?:number|null;availability?:Partial<Availability>};

export function calculateBruceSwingScore(input:V213Input):BruceSwingResult&{availability:Availability;dataQualityScore:number;componentCoverage:number}{
 const availability:Availability={
  margin:input.availability?.margin??has(input.marginWashout),
  fundamental:input.availability?.fundamental??has(input.fundamentalScore),
  daytrade:input.availability?.daytrade??has(input.daytradeRatio),
  price20:input.availability?.price20??has(input.price20Pct),
  market:input.availability?.market??has(input.marketRisk),
 };
 const foreign=clamp(val(input.foreignPersistence));
 const stealth=clamp(val(input.stealth));
 const washout=clamp(val(input.marginWashout,50));
 const trigger=clamp(val(input.trigger));
 const breakout=clamp(val(input.breakout));
 const rs=rsFrom20(input.price20Pct);
 const fundamental=clamp(val(input.fundamentalScore,50));
 const marketRisk=clamp(val(input.marketRisk,50));
 const market=100-marketRisk;
 const chip=clamp(foreign*.55+stealth*.45);
 const momentum=clamp(trigger*.65+breakout*.35);
 const foreignStealth=clamp(foreign*.52+stealth*.48);
 const breakdown={chip:r1(chip),momentum:r1(momentum),relativeStrength:r1(rs),foreignStealth:r1(foreignStealth),fundamental:r1(fundamental),market:r1(market),washout:r1(washout)};
 let score=chip*.25+momentum*.20+rs*.15+foreignStealth*.15+fundamental*.10+market*.10+washout*.05;
 const warnings:string[]=[];
 const daytrade=has(input.daytradeRatio)?Math.max(0,Number(input.daytradeRatio)):null;
 if(daytrade!=null&&daytrade>=45){score-=8;warnings.push(`當沖比 ${r1(daytrade)}% 偏高，扣 8 分`)}
 else if(daytrade!=null&&daytrade>=32){score-=4;warnings.push(`當沖比 ${r1(daytrade)}% 偏高，扣 4 分`)}
 if(!availability.fundamental)warnings.push("基本面資料不足：採中性 50 分");
 if(!availability.margin)warnings.push("融資券資料不足：採中性 50 分");
 if(!availability.daytrade)warnings.push("當沖資料不足：不套用當沖扣分");
 if(!availability.price20)warnings.push("20日價格資料不足：RS 採中性 50 分");
 if(!availability.market)warnings.push("市場風險資料不足：市場分採中性 50 分");
 const sourceConfidence=clamp(val(input.sourceConfidence,50));
 const dataQualityScore=clamp(val(input.dataQualityScore,75));
 const componentCoverage=25+20+(availability.price20?15:0)+15+(availability.fundamental?10:0)+(availability.market?10:0)+(availability.margin?5:0);
 const confidence=Math.round(clamp(sourceConfidence*.35+dataQualityScore*.40+componentCoverage*.25));
 score=r1(clamp(score));
 let grade:BruceSwingResult["grade"]="C",action:BruceSwingResult["action"]="避開";
 if(score>=82&&confidence>=72&&marketRisk<=60){grade="A1";action="偏多"}
 else if(score>=74&&confidence>=65){grade="A0";action="觀察"}
 else if(score>=66){grade="B+";action="觀察"}
 else if(score>=56){grade="B";action="等待"}
 const reasons:string[]=[];
 if(chip>=70)reasons.push(`法人籌碼 ${r1(chip)}`);
 if(momentum>=70)reasons.push(`價量動能 ${r1(momentum)}`);
 if(rs>=70&&availability.price20)reasons.push(`20日相對動能 ${r1(rs)}`);
 if(foreignStealth>=70)reasons.push(`外資潛伏 ${r1(foreignStealth)}`);
 if(fundamental>=70&&availability.fundamental)reasons.push(`基本面／營收 ${r1(fundamental)}`);
 if(washout>=70&&availability.margin)reasons.push(`籌碼洗淨 ${r1(washout)}`);
 if(market>=65&&availability.market)reasons.push(`市場環境 ${r1(market)}`);
 if(marketRisk>=70&&availability.market)warnings.push(`大盤風險 ${r1(marketRisk)} 偏高`);
 if(sourceConfidence<65)warnings.push(`個股風險資料可信度 ${r1(sourceConfidence)} 偏低`);
 if(dataQualityScore<70)warnings.push(`全站資料品質 ${r1(dataQualityScore)} 偏低`);
 return {symbol:input.symbol,stockName:input.stockName,score,grade,action,confidence,breakdown,reasons:reasons.slice(0,5),warnings,availability,dataQualityScore:r1(dataQualityScore),componentCoverage};
}

async function quality(db:DatabaseAdapter,tradeDate:string){
 try{const q=await db.execute<DatabaseRow>({sql:"SELECT score FROM daily_quality_snapshots WHERE trade_date=? LIMIT 1",args:[tradeDate]});return clamp(val(q.rows[0]?.score,75))}catch{return 75}
}

export async function refreshBruceSwingScores(db:DatabaseAdapter,tradeDate:string){
 const dataQualityScore=await quality(db,tradeDate);
 const result=await db.execute<DatabaseRow>({sql:`SELECT s.symbol,s.stock_name,s.candidate_rank,s.stealth_score,s.breakout_score,s.trigger_score,s.market_risk_score,s.margin_washout_score,s.foreign_persistence_score,s.daytrade_ratio_pct,s.risk_data_confidence_pct,s.price20_pct,e.fundamental_score FROM swing10_candidate_daily s LEFT JOIN early_watch_daily e ON e.trade_date=s.trade_date AND e.symbol=s.symbol WHERE s.trade_date=? ORDER BY s.candidate_rank ASC LIMIT 40`,args:[tradeDate]});
 const rows:any[]=[];
 for(const row of result.rows){
  const x=calculateBruceSwingScore({symbol:String(row.symbol??""),stockName:row.stock_name==null?null:String(row.stock_name),foreignPersistence:has(row.foreign_persistence_score)?Number(row.foreign_persistence_score):null,stealth:has(row.stealth_score)?Number(row.stealth_score):null,marginWashout:has(row.margin_washout_score)?Number(row.margin_washout_score):null,trigger:has(row.trigger_score)?Number(row.trigger_score):null,breakout:has(row.breakout_score)?Number(row.breakout_score):null,price20Pct:has(row.price20_pct)?Number(row.price20_pct):null,fundamentalScore:has(row.fundamental_score)?Number(row.fundamental_score):null,marketRisk:has(row.market_risk_score)?Number(row.market_risk_score):null,daytradeRatio:has(row.daytrade_ratio_pct)?Number(row.daytrade_ratio_pct):null,sourceConfidence:has(row.risk_data_confidence_pct)?Number(row.risk_data_confidence_pct):50,dataQualityScore});
  if(!x.symbol)continue;
  const now=new Date().toISOString();
  await db.execute({sql:`INSERT INTO bruce_swing_score_daily(trade_date,symbol,stock_name,score,grade,action,confidence,chip_score,momentum_score,relative_strength_score,foreign_stealth_score,fundamental_score,market_score,washout_score,reasons_json,warnings_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(trade_date,symbol) DO UPDATE SET stock_name=excluded.stock_name,score=excluded.score,grade=excluded.grade,action=excluded.action,confidence=excluded.confidence,chip_score=excluded.chip_score,momentum_score=excluded.momentum_score,relative_strength_score=excluded.relative_strength_score,foreign_stealth_score=excluded.foreign_stealth_score,fundamental_score=excluded.fundamental_score,market_score=excluded.market_score,washout_score=excluded.washout_score,reasons_json=excluded.reasons_json,warnings_json=excluded.warnings_json,updated_at=excluded.updated_at`,args:[tradeDate,x.symbol,x.stockName??null,x.score,x.grade,x.action,x.confidence,x.breakdown.chip,x.breakdown.momentum,x.breakdown.relativeStrength,x.breakdown.foreignStealth,x.breakdown.fundamental,x.breakdown.market,x.breakdown.washout,JSON.stringify(x.reasons),JSON.stringify(x.warnings),now,now]});
  rows.push(x);
 }
 rows.sort((a,b)=>b.score-a.score);
 return {ok:true,version:"M8.12.3",model:"Bruce Swing Score 2.1",tradeDate,dataQualityScore,written:rows.length,rows};
}

export async function readBruceSwingScores(db:DatabaseAdapter,tradeDate:string,limit=20){
 const safe=Math.max(1,Math.min(40,Math.trunc(limit))),dataQualityScore=await quality(db,tradeDate);
 const result=await db.execute<DatabaseRow>({sql:`SELECT b.*,s.margin_washout_score AS raw_margin_washout_score,s.daytrade_ratio_pct AS raw_daytrade_ratio_pct,s.price20_pct AS raw_price20_pct,s.market_risk_score AS raw_market_risk_score,s.risk_data_confidence_pct AS raw_source_confidence,e.fundamental_score AS raw_fundamental_score FROM bruce_swing_score_daily b LEFT JOIN swing10_candidate_daily s ON s.trade_date=b.trade_date AND s.symbol=b.symbol LEFT JOIN early_watch_daily e ON e.trade_date=b.trade_date AND e.symbol=b.symbol WHERE b.trade_date=? ORDER BY b.score DESC,b.symbol LIMIT ?`,args:[tradeDate,safe]});
 return result.rows.map(row=>({...row,data_quality_score:dataQualityScore,margin_available:has(row.raw_margin_washout_score),fundamental_available:has(row.raw_fundamental_score),daytrade_available:has(row.raw_daytrade_ratio_pct),price20_available:has(row.raw_price20_pct),market_available:has(row.raw_market_risk_score),source_confidence:val(row.raw_source_confidence,50)}));
}
