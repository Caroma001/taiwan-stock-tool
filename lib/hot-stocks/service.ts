import { randomUUID } from "node:crypto";
import { createTursoDatabase } from "@/lib/database/createTursoDatabase";
import { MigrationRunner } from "@/migrations/database/MigrationRunner";
import { tursoMigrations } from "@/migrations/turso";
import type { DatabaseRow } from "@/lib/database";
import { enqueueStockUpdate, processQueuedSymbol } from "@/lib/data-center";
import { readForeignAccumulation } from "@/lib/foreign-accumulation";

interface HotStockRow extends DatabaseRow {
  symbol: string; stock_name: string; market: string; source: string; reason: string | null;
  status: string; last_error: string | null; added_at: string; analyzed_at: string | null; updated_at: string;
  position_type: string | null; average_cost: number | null; quantity: number | null; purchase_date: string | null;
  previous_action_advice: string | null; close: number | null; trade_date: string | null;
  raw_score: number | null; market_adjustment: number | null; final_score: number | null;
  trend_score: number | null; momentum_score: number | null; volume_score: number | null; risk_score: number | null;
  confidence: number | null; recommendation: string | null; target_1: number | null; target_2: number | null;
  stop_loss: number | null; expected_return: number | null; risk_reward: number | null; reasons_json: string | null;
}

async function database(){const db=createTursoDatabase();await new MigrationRunner(db,tursoMigrations).migrate();return db;}

function n(value: unknown): number | null { if (value == null) return null; const parsed=Number(value); return Number.isFinite(parsed)?parsed:null; }
function daysSince(date: string | null) { if (!date) return null; const ms=Date.now()-new Date(`${date}T00:00:00`).getTime(); return Number.isFinite(ms)?Math.max(0,Math.floor(ms/86_400_000)):null; }
function clamp(v:number,min=0,max=100){return Math.max(min,Math.min(max,v));}

type DecisionInput={close:number|null;averageCost:number|null;quantity:number|null;purchaseDate:string|null;finalScore:number|null;trendScore:number|null;momentumScore:number|null;riskScore:number|null;target1:number|null;stopLoss:number|null;recommendation:string|null;positionType:string};
function buildPositionDecision(x:DecisionInput){
  const holding=x.positionType==='holding' && x.averageCost!=null && x.averageCost>0;
  const pnl=holding&&x.close!=null&&x.quantity!=null?(x.close-x.averageCost!)*x.quantity:null;
  const ret=holding&&x.close!=null?((x.close/x.averageCost!)-1)*100:null;
  const holdingDays=holding?daysSince(x.purchaseDate):null;
  const score=x.finalScore??0, trend=x.trendScore??50, momentum=x.momentumScore??50, risk=x.riskScore??50;
  const timePenalty=holdingDays==null?0:Math.min(18,holdingDays/12);
  const lossPenalty=ret==null?0:ret<-20?25:ret<-12?18:ret<-6?10:0;
  const healthScore=clamp(score*.42+trend*.18+momentum*.14+(100-risk)*.14+12-lossPenalty-timePenalty);
  const health=healthScore>=66?'健康':healthScore>=43?'留意':'危險';
  const efficiencyScore=clamp(score*.55+trend*.2+momentum*.15+(100-risk)*.1-timePenalty-(ret!=null&&ret<-10?8:0));
  const capitalEfficiency=efficiencyScore>=68?'高':efficiencyScore>=45?'中':'低';
  let advice='僅觀察'; let actionPrice:number|null=null;
  if(holding){
    if(health==='危險'&&capitalEfficiency==='低'&&ret!=null&&ret<=-8){advice='換股'; actionPrice=x.stopLoss??x.close;}
    else if(health==='危險'){advice='停損';actionPrice=x.stopLoss??x.close;}
    else if(capitalEfficiency==='低'&&ret!=null&&ret<0){advice='等待反彈';actionPrice=x.target1??x.averageCost;}
    else if(score>=72&&trend>=60){advice='繼續持有';}
    else if(score>=82&&ret!=null&&ret>0){advice='加碼';}
    else if(score<50){advice='減碼';actionPrice=x.target1??x.close;}
    else advice='繼續持有';
  } else {
    advice=score>=75?'可布局':score>=58?'繼續觀察':'暫不進場';
  }
  const recoveryGap=holding&&x.close!=null?((x.averageCost!-x.close)/x.close)*100:null;
  const reasons:string[]=[];
  if(holding&&ret!=null) reasons.push(`目前未實現報酬 ${ret>=0?'+':''}${ret.toFixed(2)}%。`);
  if(holdingDays!=null) reasons.push(`已持有 ${holdingDays} 天，持有時間已納入資金效率。`);
  reasons.push(`AI 最終分 ${score.toFixed(1)}，趨勢 ${trend.toFixed(1)}，動能 ${momentum.toFixed(1)}。`);
  reasons.push(`風險分數 ${risk.toFixed(1)}；持股健康度判定為${health}。`);
  if(recoveryGap!=null&&recoveryGap>0) reasons.push(`回到成本價仍需上漲約 ${recoveryGap.toFixed(1)}%。`);
  if(capitalEfficiency==='低') reasons.push('目前資金效率偏低，應設定價格或時間停損，避免資金長期卡住。');
  return {holding,pnl,ret,holdingDays,health,healthScore,capitalEfficiency,efficiencyScore,advice,actionPrice,reasons};
}

async function recordAdviceChange(db:Awaited<ReturnType<typeof database>>,row:HotStockRow,decision:ReturnType<typeof buildPositionDecision>){
  const prev=row.previous_action_advice?String(row.previous_action_advice):null;
  if(prev===decision.advice) return;
  const now=new Date().toISOString();
  await db.execute({sql:`INSERT INTO position_advice_events(id,symbol,advised_at,model_version,previous_advice,new_advice,close,average_cost,unrealized_return,position_health,capital_efficiency,action_price,reasons_json)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,args:[randomUUID(),String(row.symbol),now,'M8.6',prev,decision.advice,n(row.close),n(row.average_cost),decision.ret,decision.health,decision.capitalEfficiency,decision.actionPrice,JSON.stringify(decision.reasons)]});
  await db.execute({sql:'UPDATE hot_stock_candidates SET previous_action_advice=?,updated_at=? WHERE symbol=?',args:[decision.advice,now,String(row.symbol)]});
}

export async function listHotStocks(){
  const db=await database();
  const result=await db.execute<HotStockRow>({sql:`SELECT h.symbol,s.name stock_name,s.market,h.source,h.reason,h.status,h.last_error,h.added_at,h.analyzed_at,h.updated_at,
    h.position_type,h.average_cost,h.quantity,h.purchase_date,h.previous_action_advice,
    i.close,i.trade_date,a.raw_score,a.market_adjustment,COALESCE(a.final_score,a.total_score) final_score,a.trend_score,a.momentum_score,a.volume_score,a.risk_score,a.confidence,
    d.recommendation,d.target_1,d.target_2,d.stop_loss,d.expected_return,d.risk_reward,a.reasons_json,q.status queue_status,q.next_attempt_at,q.last_error_message queue_message
    FROM hot_stock_candidates h JOIN stocks s ON s.symbol=h.symbol
    LEFT JOIN indicator_latest i ON i.symbol=h.symbol LEFT JOIN ai_analysis_latest a ON a.symbol=h.symbol LEFT JOIN decision_latest d ON d.symbol=h.symbol
    LEFT JOIN update_queue q ON q.symbol=h.symbol AND q.purpose='hot-stock' WHERE h.is_active=1 ORDER BY h.added_at DESC`});
  const foreignMap=await readForeignAccumulation(result.rows.map(row=>String(row.symbol)));
  const rows=[];
  for(const row of result.rows){
    let reasons:string[]=[];try{const p=JSON.parse(String(row.reasons_json??'[]'));if(Array.isArray(p))reasons=p.map(String);}catch{}
    const decision=buildPositionDecision({close:n(row.close),averageCost:n(row.average_cost),quantity:n(row.quantity),purchaseDate:row.purchase_date?String(row.purchase_date):null,finalScore:n(row.final_score),trendScore:n(row.trend_score),momentumScore:n(row.momentum_score),riskScore:n(row.risk_score),target1:n(row.target_1),stopLoss:n(row.stop_loss),recommendation:row.recommendation?String(row.recommendation):null,positionType:String(row.position_type??'watch')});
    await recordAdviceChange(db,row,decision);
    rows.push({symbol:String(row.symbol),stockName:String(row.stock_name??''),market:String(row.market??''),source:String(row.source??'manual'),reason:row.reason?String(row.reason):null,
      status:String((row as any).queue_status??row.status??'waiting'),error:(row as any).queue_message?String((row as any).queue_message):(row.last_error?String(row.last_error):null),addedAt:String(row.added_at??''),analyzedAt:row.analyzed_at?String(row.analyzed_at):null,
      tradeDate:row.trade_date?String(row.trade_date):null,close:n(row.close),rawScore:n(row.raw_score),marketAdjustment:n(row.market_adjustment),finalScore:n(row.final_score),trendScore:n(row.trend_score),momentumScore:n(row.momentum_score),volumeScore:n(row.volume_score),riskScore:n(row.risk_score),confidence:n(row.confidence),recommendation:row.recommendation?String(row.recommendation):null,target1:n(row.target_1),target2:n(row.target_2),stopLoss:n(row.stop_loss),expectedReturn:n(row.expected_return),riskReward:n(row.risk_reward),
      positionType:String(row.position_type??'watch'),averageCost:n(row.average_cost),quantity:n(row.quantity),purchaseDate:row.purchase_date?String(row.purchase_date):null,...decision,
      foreignAccumulation: foreignMap.get(String(row.symbol)) ?? null});
  }
  return rows;
}

export async function addHotStock(input:{symbol:string;reason?:string;positionType?:string;averageCost?:number|null;quantity?:number|null;purchaseDate?:string|null}){
  const symbol=input.symbol.trim();if(!/^\d{4,6}$/.test(symbol))throw new Error('股票代號格式不正確。請輸入 4～6 位數字。');
  const db=await database();const stock=await db.execute<DatabaseRow&{symbol:string;name:string;is_active:number}>({sql:'SELECT symbol,name,is_active FROM stocks WHERE symbol=? LIMIT 1',args:[symbol]});const row=stock.rows[0];if(!row)throw new Error(`找不到股票代號 ${symbol}。`);if(Number(row.is_active??0)!==1)throw new Error(`${symbol} ${row.name} 目前不是有效上市櫃股票。`);
  const positionType=input.positionType==='holding'?'holding':'watch';if(positionType==='holding'&&(!(input.averageCost&&input.averageCost>0)))throw new Error('實際持有股票必須輸入平均持有成本。');
  const now=new Date().toISOString();await db.execute({sql:`INSERT INTO hot_stock_candidates(symbol,source,reason,status,last_error,added_at,analyzed_at,updated_at,is_active,position_type,average_cost,quantity,purchase_date)
    VALUES(?,?,?,'waiting',NULL,?,NULL,?,1,?,?,?,?) ON CONFLICT(symbol) DO UPDATE SET reason=excluded.reason,status='waiting',last_error=NULL,updated_at=excluded.updated_at,is_active=1,position_type=excluded.position_type,average_cost=excluded.average_cost,quantity=excluded.quantity,purchase_date=excluded.purchase_date`,args:[symbol,'manual',input.reason?.trim()||null,now,now,positionType,input.averageCost??null,input.quantity??null,input.purchaseDate??null]});
  await enqueueStockUpdate({symbol,purpose:'hot-stock',priority:1});return{symbol,stockName:String(row.name),queued:true};
}
export async function updateHotStockPosition(input:{symbol:string;positionType:string;averageCost?:number|null;quantity?:number|null;purchaseDate?:string|null}){
  const symbol=input.symbol.trim();const positionType=input.positionType==='holding'?'holding':'watch';if(positionType==='holding'&&(!(input.averageCost&&input.averageCost>0)))throw new Error('實際持有股票必須輸入平均持有成本。');
  const db=await database();const now=new Date().toISOString();await db.execute({sql:`UPDATE hot_stock_candidates SET position_type=?,average_cost=?,quantity=?,purchase_date=?,updated_at=? WHERE symbol=? AND is_active=1`,args:[positionType,positionType==='holding'?input.averageCost??null:null,positionType==='holding'?input.quantity??null:null,positionType==='holding'?input.purchaseDate??null:null,now,symbol]});return{symbol,positionType};
}
export async function removeHotStock(symbol:string){const db=await database();await db.execute({sql:'UPDATE hot_stock_candidates SET is_active=0,updated_at=? WHERE symbol=?',args:[new Date().toISOString(),symbol]});return{symbol};}
export async function analyzeHotStock(symbol:string){if(!/^\d{4,6}$/.test(symbol))throw new Error('股票代號格式不正確。');await enqueueStockUpdate({symbol,purpose:'hot-stock',priority:1});return processQueuedSymbol(symbol,'hot-stock');}
