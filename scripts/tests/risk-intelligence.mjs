import fs from "node:fs";
import ts from "typescript";

const source=fs.readFileSync("lib/risk-intelligence/service.ts","utf8");
const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true,fileName:"lib/risk-intelligence/service.ts"});
const syntaxErrors=(output.diagnostics??[]).filter((d)=>d.category===ts.DiagnosticCategory.Error);
if(syntaxErrors.length){
  for(const d of syntaxErrors) console.error(ts.flattenDiagnosticMessageText(d.messageText," "));
  process.exit(1);
}
const module={exports:{}};
const fakeRequire=(id)=>{
  if(id==="node:crypto") return {randomUUID:()=>"test-uuid"};
  if(id==="@/lib/risk-intelligence/public-data") return {fetchPublicRiskSnapshot:async()=>({})};
  return {};
};
new Function("require","module","exports",output.outputText)(fakeRequire,module,module.exports);
const engine=module.exports;
const checks=[];
const check=(name,ok,detail)=>checks.push({name,ok,detail});

const highRisk=engine.calculateMarketRisk({globalMarketScore:20,taiexCloses:[100,98,96,95,93,90,88,87,86,84,82],taiexChangePct:-3});
check("systemic market crash receives strong penalty",highRisk.level==="高"&&highRisk.modifier<=-8,highRisk);
const healthyWash=engine.calculateMarginWashout({balances:[900],currentPrevBalance:1000,price5Pct:1,foreign5:100});
check("margin contraction + resilient price + foreign support is rewarded",healthyWash.score>=70&&healthyWash.modifier>0,healthyWash);
const forced=engine.calculateMarginWashout({balances:[900],currentPrevBalance:1000,price5Pct:-12,foreign5:100});
check("forced liquidation is not mislabeled as bullish washout",forced.score<=35,forced);
const persistent=engine.calculateForeignPersistence({foreign5:100,foreign10:180,foreign20:300,buyDays5:4,buyDays20:14,todayNet:15});
const spike=engine.calculateForeignPersistence({foreign5:100,foreign10:110,foreign20:120,buyDays5:1,buyDays20:5,todayNet:90});
check("persistent foreign flow outranks one-day spike",persistent.score>spike.score,{persistent,spike});
const noisy=engine.calculateDaytradeNoise({daytradeVolume:600,marketVolume:1000,foreignOneDayShare5Pct:70});
check("high day-trading ratio adds noise penalty",noisy.penalty>=7,noisy);
const bounded=engine.combineDecisionOverlay({basePotential:95,market:{score:10,level:"低",modifier:2,reasons:[]},betaProxy:1,margin:{score:90,change1dPct:-3,change5dPct:-10,change10dPct:-15,modifier:4,reasons:[]},foreign:{score:90,oneDayShare5Pct:20,modifier:4,reasons:[]},daytrade:{ratioPct:10,penalty:0,reasons:[]}});
check("decision overlay is capped and cannot replace core model",bounded.modifier<=8&&bounded.decisionScore<=100,bounded);

const publicSource=fs.readFileSync("lib/risk-intelligence/public-data.ts","utf8");
const publicOutput=ts.transpileModule(publicSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true,fileName:"lib/risk-intelligence/public-data.ts"});
const publicModule={exports:{}};
new Function("require","module","exports",publicOutput.outputText)(()=>({}),publicModule,publicModule.exports);
const publicData=publicModule.exports;
const marginParsed=publicData.parseTwseMargin({tables:[{fields:["證券代號","證券名稱","融資前日餘額","融資買進","融資賣出","現金償還","融資今日餘額","融資使用率","融券前日餘額","融券賣出","融券買進","現券償還","融券今日餘額"],data:[["2330","台積電","1000","10","80","0","930","1.2","100","5","3","0","102"]]}]},"2026-08-14");
check("TWSE margin Bulk parser extracts per-security balance",marginParsed.length===1&&marginParsed[0].symbol==="2330"&&marginParsed[0].marginBalance===930,marginParsed);
const dayParsed=publicData.parseTwseDaytrade({tables:[{fields:["證券代號","證券名稱","當日沖銷交易成交股數","當日沖銷交易買進成交金額","當日沖銷交易賣出成交金額"],data:[["2330","台積電","600","10000","10020"]]}]},"2026-08-14");
check("TWSE day-trade Bulk parser extracts noise volume",dayParsed.length===1&&dayParsed[0].daytradeVolume===600,dayParsed);

for(const item of checks){
  console.log(item.ok?"✅":"❌",item.name,item.ok?"":JSON.stringify(item.detail));
}
if(checks.some((item)=>!item.ok)) process.exit(1);
console.log("✅ M8.10.24 Risk Intelligence tests passed");
