export type EarlyWatchTier = "EW-A" | "EW-B" | "WATCH" | "PASS";
export type LowBaseRiskLevel = "none" | "medium" | "high";

export type EarlyWatchScoreInput = {
  revenueYoyPct:number|null;
  revenueMomPct:number|null;
  revenueCumulativeYoyPct:number|null;
  revenueYoyAcceleration:number|null;
  priorRevenueYoyPct:number|null;
  currentRevenue:number|null;
  previousMonthRevenue:number|null;
  lastYearRevenue:number|null;
  accumulationScore:number|null;
  mutedPriceScore:number|null;
  foreignAccelerationScore:number|null;
  buyDays20:number|null;
  price20Pct:number|null;
  close:number|null;
  ma20:number|null;
  ma60:number|null;
  catalystScore:number|null;
  catalystCount:number;
};

export type EarlyWatchScoreResult = {
  score:number;
  tier:EarlyWatchTier;
  fundamentalScore:number;
  catalystScore:number;
  priceNotPricedScore:number;
  accumulationScore:number;
  technicalSetupScore:number;
  sourceConfidencePct:number;
  lowBaseRisk:LowBaseRiskLevel;
  evidenceCount:number;
  sustainedRevenue:boolean;
  reasons:string[];
};

const clamp=(v:number,lo=0,hi=100)=>Math.max(lo,Math.min(hi,v));
const round=(v:number,d=1)=>Number(v.toFixed(d));

function growthPoints(yoy:number|null){
  if(yoy==null) return 0;
  if(yoy<0) return -4;
  if(yoy<5) return 1;
  if(yoy<15) return 5;
  if(yoy<30) return 9;
  if(yoy<50) return 12;
  if(yoy<80) return 15;
  if(yoy<120) return 17;
  return 18; // M8.11.5: hyper-growth is capped, never linearly rewarded.
}

function detectLowBaseRisk(input:EarlyWatchScoreInput):LowBaseRiskLevel{
  const yoy=input.revenueYoyPct;
  if(yoy==null || yoy<120) return "none";
  const prior=input.priorRevenueYoyPct;
  const cumulative=input.revenueCumulativeYoyPct;
  const catalyst=input.catalystScore??0;
  const revenueRatio=(input.currentRevenue!=null&&input.lastYearRevenue!=null&&input.lastYearRevenue>0)
    ? input.currentRevenue/input.lastYearRevenue
    : null;

  // Extremely large YoY without a second independent confirmation is often a low-base / accounting-comparison artefact.
  if(yoy>=500 && catalyst<12 && (prior==null || prior<100)) return "high";
  if((revenueRatio??0)>=6 && catalyst<12 && (prior==null || prior<80)) return "high";
  if(yoy>=300 && catalyst<10 && prior==null) return "high";

  if(yoy>=180 && catalyst<10 && (prior==null || prior<30)) return "medium";
  if(yoy>=150 && cumulative!=null && cumulative<30 && catalyst<10) return "medium";
  return "none";
}

function revenueContinuity(input:EarlyWatchScoreInput){
  const yoy=input.revenueYoyPct;
  const prior=input.priorRevenueYoyPct;
  const cumulative=input.revenueCumulativeYoyPct;
  const mom=input.revenueMomPct;
  const priorConfirmed=prior!=null && prior>=10 && yoy!=null && yoy>=15;
  const cumulativeConfirmed=cumulative!=null && cumulative>=15 && (mom==null || mom>=-20) && yoy!=null && yoy>=15;
  return priorConfirmed || cumulativeConfirmed;
}

function fundamental(input:EarlyWatchScoreInput,lowBaseRisk:LowBaseRiskLevel){
  let score=0;
  const reasons:string[]=[];
  const yoy=input.revenueYoyPct;
  if(yoy!=null){
    const pts=growthPoints(yoy);
    score+=pts;
    if(yoy>=15) reasons.push(`月營收年增 ${yoy.toFixed(1)}%${yoy>=120?"（高成長封頂計分）":""}`);
    else if(yoy<0) reasons.push(`月營收年減 ${Math.abs(yoy).toFixed(1)}%`);
  }

  const cumulative=input.revenueCumulativeYoyPct;
  if(cumulative!=null){
    if(cumulative>=40){score+=8;reasons.push(`累計營收年增 ${cumulative.toFixed(1)}%`);}
    else if(cumulative>=20) score+=6;
    else if(cumulative>=10) score+=4;
    else if(cumulative>=3) score+=2;
    else if(cumulative<0) score-=2;
  }

  const mom=input.revenueMomPct;
  if(mom!=null){
    if(mom>=30){score+=4;reasons.push(`月增 ${mom.toFixed(1)}%`);}
    else if(mom>=10) score+=3;
    else if(mom>=0) score+=1;
    else if(mom<=-25) score-=3;
  }

  const accel=input.revenueYoyAcceleration;
  if(accel!=null){
    // Huge one-month accelerations are not rewarded more than a normal acceleration.
    if(accel>=10 && accel<=80){score+=4;reasons.push(`營收年增加速度 +${accel.toFixed(1)}pt`);}
    else if(accel>=3) score+=2;
    else if(accel<=-15) score-=3;
  }

  const sustained=revenueContinuity(input);
  if(sustained){score+=4;reasons.push("營收改善具連續性");}

  if(lowBaseRisk==="high"){
    score-=8;
    reasons.push("低基期風險：高，極端年增先降權等待第二項證據");
  }else if(lowBaseRisk==="medium"){
    score-=4;
    reasons.push("低基期風險：中，單月高增需持續性確認");
  }

  return {score:round(clamp(score,0,34),1),reasons,sustained};
}

function priceNotPriced(input:EarlyWatchScoreInput){
  let score=0;
  const reasons:string[]=[];
  const p=input.price20Pct;
  if(p!=null){
    if(p>=-8 && p<=3){score+=9;reasons.push(`20日僅 ${p>=0?"+":""}${p.toFixed(1)}%，價格尚未明顯反映`);}
    else if(p<=8){score+=7;reasons.push(`20日漲幅 ${p.toFixed(1)}%，仍屬早期`);}
    else if(p<=15) score+=4;
    else if(p<=20) score+=1;
    else reasons.push(`20日已漲 ${p.toFixed(1)}%，避免追高`);
  }
  if((input.mutedPriceScore??0)>=18){score+=5;reasons.push("外資買進但股價仍壓抑");}
  else if((input.mutedPriceScore??0)>=12) score+=3;
  if((input.accumulationScore??0)>=75 && (p??99)<=8){score+=3;reasons.push("籌碼先行、價格落後");}
  return {score:round(clamp(score,0,17),1),reasons};
}

function accumulation(input:EarlyWatchScoreInput){
  let score=0;
  const reasons:string[]=[];
  const a=input.accumulationScore??0;
  if(a>=85){score+=10;reasons.push(`外資吸籌 ${a.toFixed(0)}`);}
  else if(a>=75) score+=8;
  else if(a>=65) score+=6;
  else if(a>=55) score+=4;
  const accel=input.foreignAccelerationScore??0;
  if(accel>=10){score+=3;reasons.push("外資買盤加速");}
  else if(accel>=6) score+=2;
  const days=input.buyDays20??0;
  if(days>=14){score+=3;reasons.push(`20日買超 ${days} 天`);}
  else if(days>=10) score+=2;
  return {score:round(clamp(score,0,16),1),reasons};
}

function technical(input:EarlyWatchScoreInput){
  let score=0;
  const reasons:string[]=[];
  const close=input.close,ma20=input.ma20,ma60=input.ma60;
  if(close!=null && ma20!=null && ma20>0){
    const d=(close/ma20-1)*100;
    if(d>=-2 && d<=6){score+=4;reasons.push("價格靠近/站上 MA20");}
    else if(d>6 && d<=12) score+=2;
  }
  if(ma20!=null && ma60!=null && ma60>0){
    if(ma20>=ma60){score+=3;reasons.push("MA20 不弱於 MA60");}
    else if(ma20/ma60>=0.98) score+=1;
  }
  return {score:round(clamp(score,0,7),1),reasons};
}

export function scoreEarlyWatch(input:EarlyWatchScoreInput):EarlyWatchScoreResult{
  const lowBaseRisk=detectLowBaseRisk(input);
  const f=fundamental(input,lowBaseRisk);
  const p=priceNotPriced(input);
  const a=accumulation(input);
  const t=technical(input);
  const catalyst=round(clamp(input.catalystScore??0,0,18),1);
  const score=round(clamp(f.score+p.score+a.score+t.score+catalyst,0,100),1);

  const sources=[
    input.revenueYoyPct!=null,
    input.accumulationScore!=null,
    input.price20Pct!=null,
    input.close!=null&&input.ma20!=null,
    input.catalystCount>0,
  ];
  const confidence=round(sources.filter(Boolean).length/sources.length*100,0);

  const fundamentalEvidence=f.score>=20 && f.sustained;
  const accumulationEvidence=a.score>=10 && (input.accumulationScore??0)>=70 && (input.buyDays20??0)>=10;
  const priceEvidence=p.score>=9 && (input.price20Pct??99)<=10;
  const catalystEvidence=catalyst>=10;
  const technicalEvidence=t.score>=4;
  const evidenceCount=[fundamentalEvidence,accumulationEvidence,priceEvidence,catalystEvidence,technicalEvidence].filter(Boolean).length;

  let tier:EarlyWatchTier="PASS";
  const withCatalyst=catalystEvidence
    && score>=68
    && f.score>=16
    && p.score>=7
    && evidenceCount>=3
    && lowBaseRisk!=="high";
  const withoutCatalyst=!catalystEvidence
    && score>=70
    && f.score>=24
    && p.score>=9
    && a.score>=10
    && f.sustained
    && evidenceCount>=3
    && lowBaseRisk==="none"
    && (input.price20Pct??99)<=8;

  if(withCatalyst || withoutCatalyst) tier="EW-A";
  else if(score>=60 && (f.score>=16 || catalyst>=10) && p.score>=6 && evidenceCount>=2) tier="EW-B";
  else if(score>=48) tier="WATCH";

  // M8.11.5 Low-Base Guard: extreme unconfirmed YoY can be watched, but never promoted to EW-A.
  if(lowBaseRisk==="high" && catalyst<12 && tier==="EW-A") tier="EW-B";
  if(lowBaseRisk==="high" && catalyst<8 && tier==="EW-B" && !f.sustained) tier="WATCH";
  if(lowBaseRisk==="medium" && catalyst<10 && tier==="EW-A") tier="EW-B";

  const reasons=[...f.reasons,...p.reasons,...a.reasons,...t.reasons];
  if(catalyst>0) reasons.push(`事件催化 +${catalyst.toFixed(0)}`);
  reasons.push(`獨立證據 ${evidenceCount}/5`);
  if(tier!=="EW-A" && score>=68) reasons.push("高分但未通過 EW-A 多證據確認");

  return {
    score,tier,
    fundamentalScore:f.score,
    catalystScore:catalyst,
    priceNotPricedScore:p.score,
    accumulationScore:a.score,
    technicalSetupScore:t.score,
    sourceConfidencePct:confidence,
    lowBaseRisk,evidenceCount,sustainedRevenue:f.sustained,
    reasons:[...new Set(reasons)].slice(0,12),
  };
}
