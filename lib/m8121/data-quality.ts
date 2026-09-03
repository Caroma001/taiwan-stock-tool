import type { DataSourceQuality, M8121DataQuality } from "./types";

const clamp=(v:number)=>Math.max(0,Math.min(100,v));

export function evaluateM8121DataQuality(input:{
  tradeDate:string;
  reportExists:boolean;
  sourceDates:M8121DataQuality["sourceDates"];
  sources:DataSourceQuality[];
}):M8121DataQuality{
  const price=input.sources.find(s=>s.key==="price");
  const failed=input.sources.filter(s=>!s.ok);

  const weighted=input.sources.reduce((acc,s)=>{
    const weight=s.key==="price"?4:1;
    const coverage=s.minRows<=0?1:Math.min(1,s.rows/s.minRows);
    return {value:acc.value+coverage*weight,weight:acc.weight+weight};
  },{value:0,weight:0});

  const score=clamp(Math.round((weighted.weight?weighted.value/weighted.weight:0)*100));
  let publishMode:M8121DataQuality["publishMode"]="full";
  let level:M8121DataQuality["level"]="green";

  // 核心原則：只有 Price 不完整才 BLOCKED。
  if(!price?.ok){publishMode="blocked";level="red";}
  else if(failed.length){publishMode="degraded";level="yellow";}

  return {
    version:"M8.12.3",
    tradeDate:input.tradeDate,
    score,level,publishMode,
    reportExists:input.reportExists,
    sources:input.sources,
    warnings:failed.map(s=>`${s.key}: ${s.rows}/${s.minRows}${s.message?`（${s.message}）`:""}`),
    sourceDates:input.sourceDates,
  };
}
