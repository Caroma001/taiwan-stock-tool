export type Swing10OpportunityGrade = "A1" | "A0" | "B+" | "B" | "C";
export type Swing10MarketPosture = "normal" | "caution" | "avoid";

const clamp=(v:number,lo=0,hi=100)=>Math.max(lo,Math.min(hi,v));
const round=(v:number,d=1)=>Number(v.toFixed(d));

export function swing10MarketPosture(level:string, score:number|null):{
  posture:Swing10MarketPosture;
  label:string;
  reason:string;
}{
  const s=score??0;
  if(s>=85) return {posture:"avoid",label:"🔴 暫緩追價",reason:`大盤風險 ${Math.round(s)}，新部位以防守為主`};
  if(level==="高" || s>=70) return {posture:"caution",label:"🟡 縮小部位",reason:`大盤風險 ${Math.round(s)}，股票等級保留但降低進場積極度`};
  return {posture:"normal",label:"🟢 正常觀察",reason:`大盤風險 ${Math.round(s)}，未限制個股機會等級`};
}

export type Swing10OpportunityInput={
  decision:number;
  stealth:number|null;
  breakout:number|null;
  trigger:number|null;
  persistence:number|null;
  daytradePenalty:number|null;
  daytradeRatio:number|null;
  marketRisk:string;
  marketRiskScore:number|null;
  confidence:number|null;
  margin:number|null;
  price20:number|null;
  decisionDelta1d:number|null;
  decisionDelta3d:number|null;
  hasPrevious:boolean;
};

export type Swing10OpportunityResult={
  swing10Score:number;
  grade:Swing10OpportunityGrade;
  entryGatePass:boolean;
  testGatePass:boolean;
  marketPosture:ReturnType<typeof swing10MarketPosture>;
  reasons:string[];
  hardBlockers:string[];
  softBlockers:string[];
};

/**
 * M8.11.1 Opportunity Grade v2
 *
 * Key rule: market beta risk is NOT a second veto.  It is already included in
 * Decision Score by Risk Intelligence, so Swing10 keeps it as a separate
 * position-sizing / timing posture instead of downgrading every stock together.
 *
 * A1 = confirmed opportunity (absolute quality + at least one prior observation)
 * A0 = new/near-entry opportunity (strong absolute setup, at most one soft gap)
 */
export function evaluateSwing10Opportunity(input:Swing10OpportunityInput):Swing10OpportunityResult{
  const persistenceNeutral=input.persistence??45;
  const confidenceNeutral=input.confidence??35;
  const triggerNeutral=input.trigger??45;
  const stealthNeutral=input.stealth??45;
  const readinessBase=input.decision*.55+stealthNeutral*.20+triggerNeutral*.10+persistenceNeutral*.10+confidenceNeutral*.05;
  const velocity=(input.decisionDelta1d??0)*.8+(input.decisionDelta3d??0)*.25;
  const swing10Score=round(clamp(readinessBase+clamp(velocity,-6,6)),1);
  const reasons:string[]=[];
  const hard:string[]=[];
  const soft:string[]=[];

  if(input.decision>=50) reasons.push(`決策分 ${input.decision.toFixed(1)} ≥ 50`);
  else if(input.decision>=47) soft.push(`決策分 ${input.decision.toFixed(1)} 接近50`);
  else hard.push("決策分低於47");

  if((input.stealth??0)>=60) reasons.push(`法人潛伏 ${(input.stealth??0).toFixed(1)} ≥ 60`);
  else if((input.stealth??0)>=55) soft.push("法人潛伏接近60");
  else hard.push("法人潛伏低於55");

  if((input.trigger??0)>=55) reasons.push(`發動確認 ${(input.trigger??0).toFixed(0)} ≥ 55`);
  else if((input.trigger??0)>=48) soft.push("發動確認接近門檻");
  else hard.push("發動確認不足48");

  if(input.persistence!=null && input.persistence>=55) reasons.push(`外資續航 ${input.persistence.toFixed(0)}`);
  else if(input.persistence==null) soft.push("外資續航待補");
  else if(input.persistence>=45) soft.push("外資續航偏中性");
  else hard.push("外資續航低於45");

  if(input.daytradePenalty!=null){
    if(input.daytradePenalty<=6) reasons.push(`當沖 ${input.daytradeRatio==null?"—":input.daytradeRatio.toFixed(0)+"%"}／雜訊 -${input.daytradePenalty.toFixed(0)}`);
    else if(input.daytradePenalty<=8) soft.push("當沖雜訊偏高");
    else hard.push("當沖雜訊過熱");
  } else soft.push("當沖資料待補");

  if(input.confidence!=null && input.confidence>=40) reasons.push(`風險情報完整度 ${input.confidence.toFixed(0)}%`);
  else if((input.confidence??0)>=30) soft.push("風險情報完整度偏低");
  else hard.push("風險情報完整度不足30%");

  if(input.price20==null || (input.price20>=-12 && input.price20<=15)) reasons.push("20日價格未過度延伸/破壞");
  else hard.push(input.price20>15?"20日漲幅過度延伸":"20日趨勢過弱");

  if(input.hasPrevious){
    if(input.decisionDelta1d!=null && input.decisionDelta1d>=-1) reasons.push(`決策分1日變化 ${input.decisionDelta1d>=0?"+":""}${input.decisionDelta1d.toFixed(1)}`);
    else if(input.decisionDelta1d!=null && input.decisionDelta1d>-3) soft.push("決策分短線略轉弱");
    else if(input.decisionDelta1d!=null) hard.push("決策分短線明顯轉弱");
    if(input.decisionDelta3d!=null && input.decisionDelta3d<-3) hard.push("決策分3日趨勢轉弱");
  } else reasons.push("首次強勢候選：以 A0 觀察，不因缺少昨日排名直接降為B");

  // Margin is confirmation only. Missing margin never blocks an otherwise good setup.
  if(input.margin!=null && input.margin>=60) reasons.push(`融資清洗 ${input.margin.toFixed(0)}`);
  else if(input.margin!=null && input.margin<15) hard.push("融資籌碼明顯偏弱");
  else if(input.margin!=null && input.margin<25) soft.push("融資籌碼偏弱");

  const absoluteConfirmed=swing10Score>=60 && hard.length===0 && soft.length===0;
  const nearOpportunity=swing10Score>=58 && hard.length===0 && soft.length<=1;
  let grade:Swing10OpportunityGrade="C";
  if(absoluteConfirmed && input.hasPrevious) grade="A1";
  else if(absoluteConfirmed || nearOpportunity) grade="A0";
  else if(swing10Score>=55 && hard.length===0 && soft.length<=2) grade="B+";
  else if(swing10Score>=50) grade="B";

  const marketPosture=swing10MarketPosture(input.marketRisk,input.marketRiskScore);
  const reasonList=[...reasons,...soft.map(x=>`觀察：${x}`),...hard.map(x=>`待改善：${x}`),`市場操作：${marketPosture.label}`].slice(0,14);
  return {
    swing10Score,grade,
    entryGatePass:grade==="A1",
    testGatePass:grade==="A1"||grade==="A0",
    marketPosture,
    reasons:reasonList,hardBlockers:hard,softBlockers:soft,
  };
}
