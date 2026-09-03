import { randomUUID } from "node:crypto";
import { TursoDatabaseAdapter } from "@/adapters/turso";
import { getTursoClient } from "@/lib/turso";
import type { DatabaseAdapter, DatabaseRow } from "@/lib/database";
import { MigrationRunner } from "@/migrations/database/MigrationRunner";
import { tursoMigrations } from "@/migrations/turso";
import { calculateBuyFee } from "@/lib/portfolio/trade-calculator";
import { evaluateSwing10ExitRules, type Swing10ExitAction } from "@/lib/swing10/exit-rules";
import { readSmartSelection } from "@/lib/smart-selection/service";
import { refreshInstitutionalStealth } from "@/lib/institutional-stealth/service";
import { refreshCandidateRiskIntelligence } from "@/lib/risk-intelligence/service";
import { evaluateSwing10Opportunity } from "@/lib/swing10/opportunity-grade";

const VERSION = "M8.11.8";
const USER_NAME = "Bruce";
const round = (v:number,d=2)=>Number(v.toFixed(d));
const n=(v:unknown,fallback=0)=>Number.isFinite(Number(v))?Number(v):fallback;
const nullable=(v:unknown)=>v==null||!Number.isFinite(Number(v))?null:Number(v);
const text=(v:unknown)=>{const s=String(v??"").trim();return s||null;};
const jsonArray=(v:unknown):string[]=>{try{const x=Array.isArray(v)?v:JSON.parse(String(v??"[]"));return Array.isArray(x)?x.map(String):[];}catch{return[];}};

async function database(migrate=true){
  const db=new TursoDatabaseAdapter(getTursoClient());
  if(migrate) await new MigrationRunner(db,tursoMigrations).migrate();
  return db;
}

export type Swing10TradeAction=Swing10ExitAction;

export type CreateSwing10TradeInput={
  symbol:string;
  holdingType:"real"|"test";
  buyPrice?:number|null;
  quantityLots?:number|null;
  buyDate?:string|null;
  note?:string|null;
  takeProfitPct?:number|null;
  stopLossPct?:number|null;
  maxHoldingDays?:number|null;
};

export async function createSwing10Trade(input:CreateSwing10TradeInput){
  const db=await database(true);
  const symbol=String(input.symbol??"").trim();
  const holdingType=input.holdingType==="test"?"test":"real";
  if(!symbol) throw new Error("缺少股票代號");

  const candidateResult=await db.execute<DatabaseRow>({
    sql:`SELECT sc.*,i.close AS latest_close,i.trade_date AS latest_price_date
         FROM swing10_candidate_daily sc
         LEFT JOIN indicator_latest i ON i.symbol=sc.symbol
         WHERE sc.symbol=? AND sc.trade_date=(SELECT MAX(trade_date) FROM swing10_candidate_daily)
         LIMIT 1`,
    args:[symbol],
  });
  const candidate=candidateResult.rows[0];
  if(!candidate) throw new Error(`${symbol} 不在最新 Swing10 候選中`);
  const candidateGrade=String(candidate.grade);
  const confirmed=candidateGrade==="A1" && Number(candidate.entry_gate_pass??0)===1;
  const testable=confirmed || candidateGrade==="A0";
  if(holdingType==="real" && !confirmed) throw new Error(`${symbol} 目前為 ${candidateGrade}；實際買入需 A1 確認，A0 建議先加入測試。`);
  if(holdingType==="test" && !testable) throw new Error(`${symbol} 目前不是 A1/A0 Swing10 機會，不開放建立 Swing10 測試部位`);
  const candidateDate=String(candidate.trade_date??"");
  const latestPriceDate=String(candidate.latest_price_date??candidateDate);
  if(/^\d{4}-\d{2}-\d{2}$/.test(latestPriceDate) && latestPriceDate>candidateDate){
    throw new Error(`Swing10 A級資料停在 ${candidateDate}，但價格已到 ${latestPriceDate}；請先完成今日一鍵更新再決定買入。`);
  }

  const existing=await db.execute<DatabaseRow>({
    sql:`SELECT pl.id FROM portfolio_lots pl
         JOIN swing10_trade_positions sp ON sp.lot_id=pl.id
         WHERE pl.user_name=? AND pl.symbol=? AND pl.holding_type=?
           AND pl.status='open' AND pl.remaining_lots>0 LIMIT 1`,
    args:[USER_NAME,symbol,holdingType],
  });
  if(existing.rows.length){
    return {ok:true,alreadyExists:true,lotId:String(existing.rows[0].id),symbol,holdingType};
  }

  const defaultPrice=n(candidate.latest_close);
  const buyPrice=n(input.buyPrice,defaultPrice);
  const quantity=n(input.quantityLots,holdingType==="test"?1:0);
  if(buyPrice<=0) throw new Error("找不到有效買進價，請輸入實際買入價格");
  if(quantity<=0) throw new Error("請輸入買進張數；可使用 0.1 代表 100 股零股部位");

  const takeProfitPct=Math.max(3,Math.min(20,n(input.takeProfitPct,8)));
  const stopLossPct=-Math.max(2,Math.min(12,Math.abs(n(input.stopLossPct,4.5))));
  const maxHoldingDays=Math.max(5,Math.min(15,Math.round(n(input.maxHoldingDays,10))));
  const buyDate=String(input.buyDate??candidate.trade_date??candidate.latest_price_date??"").slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(buyDate)) throw new Error("買進日期格式不正確");

  const lotId=randomUUID();
  const now=new Date().toISOString();
  const grossCost=buyPrice*quantity*1000;
  const fees=holdingType==="real"?calculateBuyFee(grossCost):0;
  const targetSellPrice=round(buyPrice*(1+takeProfitPct/100),2);
  const strategyBatchId=`swing10-${String(candidate.trade_date)}`;
  const note=[
    `M8.11.8 Swing10 ${candidateGrade}${holdingType==="test"?"測試":"實際"}部位`,
    input.note?.trim()||null,
  ].filter(Boolean).join("；");

  await db.transaction(async tx=>{
    await tx.execute({
      sql:`INSERT INTO portfolio_lots(
        id,user_name,symbol,buy_date,buy_price,quantity_lots,remaining_lots,target_sell_price,
        fees,tax,note,holding_type,status,created_at,updated_at,
        strategy_tag,strategy_batch_id,selection_rank,entry_potential_score,entry_breakout_score,entry_stealth_score,entry_stage
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args:[
        lotId,USER_NAME,symbol,buyDate,buyPrice,quantity,quantity,targetSellPrice,
        fees,0,note,holdingType,"open",now,now,
        `swing10-${candidateGrade.toLowerCase()}`,strategyBatchId,n(candidate.candidate_rank),nullable(candidate.potential_score),nullable(candidate.breakout_score),nullable(candidate.stealth_score),`Swing10 ${candidateGrade}`,
      ],
    });
    await tx.execute({
      sql:`INSERT INTO swing10_trade_positions(
        lot_id,symbol,holding_type,entry_trade_date,entry_grade,entry_rank,
        entry_swing10_score,entry_decision_score,entry_potential_score,entry_stealth_score,entry_trigger_score,
        entry_market_risk_level,entry_market_risk_score,entry_margin_washout_score,entry_foreign_persistence_score,
        entry_daytrade_ratio_pct,entry_daytrade_noise_penalty,entry_risk_confidence_pct,
        take_profit_pct,stop_loss_pct,max_holding_days,no_momentum_check_day,no_momentum_min_peak_pct,
        profit_protect_trigger_pct,profit_protect_giveback_pct,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args:[
        lotId,symbol,holdingType,String(candidate.trade_date),candidateGrade,n(candidate.candidate_rank),
        nullable(candidate.swing10_score),nullable(candidate.decision_score),nullable(candidate.potential_score),nullable(candidate.stealth_score),nullable(candidate.trigger_score),
        text(candidate.market_risk_level),nullable(candidate.market_risk_score),nullable(candidate.margin_washout_score),nullable(candidate.foreign_persistence_score),
        nullable(candidate.daytrade_ratio_pct),nullable(candidate.daytrade_noise_penalty),nullable(candidate.risk_data_confidence_pct),
        takeProfitPct,stopLossPct,maxHoldingDays,7,3,8,4,now,now,
      ],
    });
  },{mode:"write"});

  await refreshSwing10ExitAlerts(db,String(candidate.trade_date)).catch(()=>undefined);
  return {ok:true,alreadyExists:false,lotId,symbol,holdingType,buyPrice,quantityLots:quantity,buyDate,targetSellPrice,takeProfitPct,stopLossPct,maxHoldingDays};
}

function evaluateExit(row:DatabaseRow){
  const buyPrice=n(row.buy_price);
  const currentPrice=nullable(row.current_price);
  const currentReturn=currentPrice==null||buyPrice<=0?null:round((currentPrice/buyPrice-1)*100,2);
  const maxClose=nullable(row.max_close);
  const maxReturn=maxClose==null||buyPrice<=0?currentReturn:round((maxClose/buyPrice-1)*100,2);
  const holdingDays=Math.max(0,n(row.holding_days));
  const currentGrade=text(row.current_grade)??"OUT";
  const decision=nullable(row.current_decision_score);
  const entryDecision=nullable(row.entry_decision_score);
  const decisionChange=decision==null||entryDecision==null?null:round(decision-entryDecision,1);
  const persistence=nullable(row.current_foreign_persistence_score);
  const marketRisk=text(row.current_market_risk_level)??"待補";
  const noise=nullable(row.current_daytrade_noise_penalty);
  const riskChange=text(row.current_risk_change_level)??"stable";
  const rules=evaluateSwing10ExitRules({
    currentReturnPct:currentReturn,maxReturnPct:maxReturn,holdingDays,currentGrade,inTop20:row.current_rank!=null,
    decisionChangeFromEntry:decisionChange,foreignPersistenceScore:persistence,
    marketRiskLevel:marketRisk,daytradeNoisePenalty:noise,riskChangeLevel:riskChange,
    takeProfitPct:n(row.take_profit_pct,8),stopLossPct:n(row.stop_loss_pct,-4.5),
    maxHoldingDays:Math.max(5,n(row.max_holding_days,10)),
    noMomentumCheckDay:Math.max(5,n(row.no_momentum_check_day,7)),
    noMomentumMinPeakPct:n(row.no_momentum_min_peak_pct,3),
    profitProtectTriggerPct:n(row.profit_protect_trigger_pct,8),
    profitProtectGivebackPct:n(row.profit_protect_giveback_pct,4),
  });
  return {action:rules.action,severity:rules.severity,reasons:rules.reasons,currentReturn,maxReturn,drawdown:rules.drawdownFromPeakPct,holdingDays,decisionChange,currentGrade};
}

export async function refreshSwing10ExitAlerts(db:DatabaseAdapter,tradeDate:string){
  const open=await db.execute<DatabaseRow>({
    sql:`SELECT sp.*,pl.buy_date,pl.buy_price,pl.remaining_lots,pl.target_sell_price,pl.note,
      s.name AS stock_name,
      COALESCE((SELECT dp.close FROM daily_prices dp WHERE dp.symbol=pl.symbol AND dp.trade_date<=? ORDER BY dp.trade_date DESC LIMIT 1),i.close) AS current_price,
      (SELECT COUNT(*) FROM daily_prices dp WHERE dp.symbol=pl.symbol AND dp.trade_date>=pl.buy_date AND dp.trade_date<=?) AS holding_days,
      (SELECT MAX(dp.close) FROM daily_prices dp WHERE dp.symbol=pl.symbol AND dp.trade_date>=pl.buy_date AND dp.trade_date<=?) AS max_close
    FROM swing10_trade_positions sp
    JOIN portfolio_lots pl ON pl.id=sp.lot_id
    LEFT JOIN stocks s ON s.symbol=pl.symbol
    LEFT JOIN indicator_latest i ON i.symbol=pl.symbol
    WHERE pl.user_name=? AND pl.status='open' AND pl.remaining_lots>0
    ORDER BY sp.holding_type,sp.symbol`,
    args:[tradeDate,tradeDate,tradeDate,USER_NAME],
  });
  if(!open.rows.length) return {ok:true,tradeDate,total:0,hold:0,watch:0,sellCheck:0};

  const symbols=[...new Set(open.rows.map(row=>String(row.symbol)).filter(Boolean))];
  // M8.11.3 Position Continuity: held/test positions are scored every trading day
  // even after they leave the new-entry Top20. All calculations are local Turso
  // features; official public risk data remains daily bulk/cached.
  await refreshInstitutionalStealth(symbols,symbols.length).catch(()=>undefined);
  await refreshCandidateRiskIntelligence(db,symbols,tradeDate).catch(()=>undefined);
  const selection=await readSmartSelection(Math.max(symbols.length,1),symbols).catch(()=>({rows:[]} as any));
  const selectionMap=new Map<string,any>((selection.rows??[]).map((row:any)=>[String(row.symbol),row]));

  const top20=await db.execute<DatabaseRow>({
    sql:`SELECT symbol,candidate_rank FROM swing10_candidate_daily WHERE trade_date=? AND symbol IN (${symbols.map(()=>"?").join(",")})`,
    args:[tradeDate,...symbols],
  }).catch(()=>({rows:[] as readonly DatabaseRow[],rowsAffected:0}));
  const top20Map=new Map<string,number>();
  for(const row of top20.rows){
    const symbol=String(row.symbol??"").trim();
    if(symbol) top20Map.set(symbol,n(row.candidate_rank));
  }

  const lotIds=open.rows.map(row=>String(row.lot_id));
  let previousRows:readonly DatabaseRow[]=[];
  if(lotIds.length){
    const previous=await db.execute<DatabaseRow>({
      sql:`SELECT a.* FROM swing10_exit_alert_daily a JOIN (
        SELECT lot_id,MAX(trade_date) AS trade_date FROM swing10_exit_alert_daily
        WHERE trade_date<? AND lot_id IN (${lotIds.map(()=>"?").join(",")}) GROUP BY lot_id
      ) x ON x.lot_id=a.lot_id AND x.trade_date=a.trade_date`,
      args:[tradeDate,...lotIds],
    }).catch(()=>({rows:[] as readonly DatabaseRow[],rowsAffected:0}));
    previousRows=previous.rows;
  }
  const previousMap=new Map<string,DatabaseRow>();
  for(const row of previousRows){
    const lotId=String(row.lot_id??"").trim();
    if(lotId) previousMap.set(lotId,row);
  }

  const enriched:DatabaseRow[]=open.rows.map((row):DatabaseRow=>{
    const symbol=String(row.symbol), current=selectionMap.get(symbol), prev=previousMap.get(String(row.lot_id));
    if(!current) return {...row,
      current_grade:"OUT",current_rank:top20Map.get(symbol)??null,current_swing10_score:null,current_decision_score:null,
      current_stealth_score:null,current_foreign_persistence_score:null,current_market_risk_level:"待補",current_market_risk_score:null,
      current_daytrade_noise_penalty:null,current_risk_change_level:"watch",
    };
    const risk=current.riskOverlay??null;
    const decision=nullable(current.decisionScore??current.potentialScore);
    const prevDecision=nullable(prev?.current_decision_score??row.entry_decision_score);
    const decisionDelta=decision==null||prevDecision==null?null:round(decision-prevDecision,1);
    const persistence=nullable(risk?.foreignPersistenceScore);
    const prevPersistence=nullable(prev?.current_foreign_persistence_score);
    const marketRisk=nullable(risk?.marketRiskScore);
    const prevMarketRisk=nullable(prev?.current_market_risk_score);
    const noise=nullable(risk?.daytradeNoisePenalty);
    const prevNoise=nullable(prev?.current_daytrade_noise_penalty);
    const marketRiskLevel=String(risk?.marketRiskLevel??"待補");
    let riskChangeLevel="stable";
    if((decisionDelta??0)<=-3 || (persistence!=null&&prevPersistence!=null&&persistence-prevPersistence<=-12) || (noise!=null&&prevNoise!=null&&noise-prevNoise>=3) || (marketRisk!=null&&prevMarketRisk!=null&&marketRisk-prevMarketRisk>=10)) riskChangeLevel="watch";
    if((decisionDelta??0)<=-7 || (persistence!=null&&prevPersistence!=null&&persistence-prevPersistence<=-25)) riskChangeLevel="high";
    const opportunity=evaluateSwing10Opportunity({
      decision:decision??0,stealth:nullable(current.stealthScore),breakout:nullable(current.breakoutScore),trigger:nullable(current.stealthComponents?.trigger),
      persistence,daytradePenalty:noise,daytradeRatio:nullable(risk?.daytradeRatioPct),marketRisk:marketRiskLevel,marketRiskScore:marketRisk,
      confidence:nullable(risk?.dataConfidencePct),margin:nullable(risk?.marginWashoutScore),price20:nullable(current.price20Pct),
      decisionDelta1d:decisionDelta,decisionDelta3d:null,hasPrevious:Boolean(prev)||String(row.entry_trade_date)<tradeDate,
    });
    return {...row,
      current_grade:opportunity.grade,current_rank:top20Map.get(symbol)??null,current_swing10_score:opportunity.swing10Score,
      current_decision_score:decision,current_stealth_score:nullable(current.stealthScore),current_foreign_persistence_score:persistence,
      current_market_risk_level:marketRiskLevel,current_market_risk_score:marketRisk,current_daytrade_noise_penalty:noise,current_risk_change_level:riskChangeLevel,
    };
  });

  const now=new Date().toISOString();
  const evaluated=enriched.map(row=>({row,result:evaluateExit(row)}));
  if(evaluated.length){
    await db.executeMany(evaluated.map(({row,result})=>({
      sql:`INSERT INTO swing10_exit_alert_daily(
        lot_id,trade_date,symbol,holding_type,holding_days,current_price,return_pct,max_return_pct,drawdown_from_peak_pct,
        current_grade,current_rank,current_swing10_score,current_decision_score,decision_change_from_entry,current_stealth_score,
        current_foreign_persistence_score,current_market_risk_level,current_market_risk_score,current_daytrade_noise_penalty,
        action,severity,reasons_json,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(lot_id,trade_date) DO UPDATE SET
        holding_days=excluded.holding_days,current_price=excluded.current_price,return_pct=excluded.return_pct,
        max_return_pct=excluded.max_return_pct,drawdown_from_peak_pct=excluded.drawdown_from_peak_pct,
        current_grade=excluded.current_grade,current_rank=excluded.current_rank,current_swing10_score=excluded.current_swing10_score,
        current_decision_score=excluded.current_decision_score,decision_change_from_entry=excluded.decision_change_from_entry,
        current_stealth_score=excluded.current_stealth_score,current_foreign_persistence_score=excluded.current_foreign_persistence_score,
        current_market_risk_level=excluded.current_market_risk_level,current_market_risk_score=excluded.current_market_risk_score,
        current_daytrade_noise_penalty=excluded.current_daytrade_noise_penalty,action=excluded.action,severity=excluded.severity,
        reasons_json=excluded.reasons_json,updated_at=excluded.updated_at`,
      args:[
        String(row.lot_id),tradeDate,String(row.symbol),String(row.holding_type),result.holdingDays,nullable(row.current_price),result.currentReturn,result.maxReturn,result.drawdown,
        result.currentGrade,row.current_rank==null?null:n(row.current_rank),nullable(row.current_swing10_score),nullable(row.current_decision_score),result.decisionChange,nullable(row.current_stealth_score),
        nullable(row.current_foreign_persistence_score),text(row.current_market_risk_level),nullable(row.current_market_risk_score),nullable(row.current_daytrade_noise_penalty),
        result.action,result.severity,JSON.stringify(result.reasons),now,now,
      ],
    })));
  }
  return {ok:true,tradeDate,total:evaluated.length,hold:evaluated.filter(x=>x.result.action==="hold").length,watch:evaluated.filter(x=>x.result.action==="watch").length,sellCheck:evaluated.filter(x=>x.result.action==="sell_check").length};
}

export async function refreshSwing10ExitAlertsWithMigration(tradeDate?:string){
  const db=await database(true);
  let date=tradeDate;
  if(!date){
    const latest=await db.execute<DatabaseRow>({sql:"SELECT MAX(trade_date) AS trade_date FROM swing10_candidate_daily"});
    date=String(latest.rows[0]?.trade_date??"");
  }
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date??""))) throw new Error("找不到 Swing10 交易日");
  return refreshSwing10ExitAlerts(db,String(date));
}

function performance(rows:readonly DatabaseRow[],holdingType:"real"|"test"){
  const selected=rows.filter(r=>String(r.holding_type)===holdingType);
  const returns=selected.map(r=>n(r.realized_return_pct));
  const wins=returns.filter(v=>v>0).length;
  return {
    closedTrades:selected.length,
    wins,
    losses:selected.length-wins,
    winRatePct:selected.length?round(wins/selected.length*100,1):0,
    averageReturnPct:selected.length?round(returns.reduce((a,b)=>a+b,0)/selected.length,2):0,
    totalProfit:round(selected.reduce((a,r)=>a+n(r.realized_profit),0),0),
    averageHoldingDays:selected.length?round(selected.reduce((a,r)=>a+n(r.holding_days),0)/selected.length,1):0,
  };
}

export async function readSwing10TradeDashboard(){
  const db=await database(true);
  const latestDateResult=await db.execute<DatabaseRow>({sql:"SELECT MAX(trade_date) AS trade_date FROM swing10_candidate_daily"});
  const tradeDate=String(latestDateResult.rows[0]?.trade_date??"");
  const [activeResult,historyResult]=await Promise.all([
    db.execute<DatabaseRow>({
      sql:`WITH latest_alert AS (
        SELECT a.* FROM swing10_exit_alert_daily a
        JOIN (SELECT lot_id,MAX(trade_date) AS trade_date FROM swing10_exit_alert_daily GROUP BY lot_id) x
          ON x.lot_id=a.lot_id AND x.trade_date=a.trade_date
      )
      SELECT sp.*,pl.buy_date,pl.buy_price,pl.quantity_lots,pl.remaining_lots,pl.target_sell_price,pl.fees,pl.note,
             s.name AS stock_name,i.close AS latest_price,i.trade_date AS latest_price_date,
             a.trade_date AS alert_trade_date,a.holding_days,a.current_price,a.return_pct,a.max_return_pct,a.drawdown_from_peak_pct,
             a.current_grade,a.current_rank,a.current_swing10_score,a.current_decision_score,a.decision_change_from_entry,
             a.current_stealth_score,a.current_foreign_persistence_score,a.current_market_risk_level,a.current_market_risk_score,
             a.current_daytrade_noise_penalty,a.action,a.severity,a.reasons_json
      FROM swing10_trade_positions sp
      JOIN portfolio_lots pl ON pl.id=sp.lot_id
      LEFT JOIN stocks s ON s.symbol=pl.symbol
      LEFT JOIN indicator_latest i ON i.symbol=pl.symbol
      LEFT JOIN latest_alert a ON a.lot_id=sp.lot_id
      WHERE pl.user_name=? AND pl.status='open' AND pl.remaining_lots>0
      ORDER BY CASE COALESCE(a.action,'hold') WHEN 'sell_check' THEN 1 WHEN 'watch' THEN 2 ELSE 3 END,sp.holding_type,sp.symbol`,
      args:[USER_NAME],
    }),
    db.execute<DatabaseRow>({
      sql:`SELECT th.*,
        (SELECT COUNT(*) FROM daily_prices dp WHERE dp.symbol=th.symbol AND dp.trade_date BETWEEN th.buy_date AND th.sell_date) AS holding_days
      FROM trade_history th
      JOIN swing10_trade_positions sp ON sp.lot_id=th.lot_id
      WHERE th.user_name=? ORDER BY th.sell_date DESC,th.created_at DESC`,
      args:[USER_NAME],
    }),
  ]);

  const active=activeResult.rows.map(row=>({
    lotId:String(row.lot_id),symbol:String(row.symbol),stockName:String(row.stock_name??""),holdingType:String(row.holding_type) as "real"|"test",
    buyDate:String(row.buy_date),buyPrice:n(row.buy_price),quantityLots:n(row.remaining_lots),targetSellPrice:nullable(row.target_sell_price),
    entryTradeDate:String(row.entry_trade_date),entryGrade:String(row.entry_grade),entryRank:row.entry_rank==null?null:n(row.entry_rank),
    entrySwing10Score:nullable(row.entry_swing10_score),entryDecisionScore:nullable(row.entry_decision_score),entryStealthScore:nullable(row.entry_stealth_score),entryTriggerScore:nullable(row.entry_trigger_score),
    takeProfitPct:n(row.take_profit_pct,8),stopLossPct:n(row.stop_loss_pct,-4.5),maxHoldingDays:n(row.max_holding_days,10),
    currentPrice:nullable(row.current_price??row.latest_price),holdingDays:n(row.holding_days),returnPct:nullable(row.return_pct),maxReturnPct:nullable(row.max_return_pct),drawdownFromPeakPct:nullable(row.drawdown_from_peak_pct),
    currentGrade:text(row.current_grade)??"—",currentRank:row.current_rank==null?null:n(row.current_rank),currentSwing10Score:nullable(row.current_swing10_score),currentDecisionScore:nullable(row.current_decision_score),decisionChangeFromEntry:nullable(row.decision_change_from_entry),
    currentStealthScore:nullable(row.current_stealth_score),foreignPersistenceScore:nullable(row.current_foreign_persistence_score),marketRiskLevel:text(row.current_market_risk_level)??"待補",marketRiskScore:nullable(row.current_market_risk_score),daytradeNoisePenalty:nullable(row.current_daytrade_noise_penalty),
    action:String(row.action??"hold") as Swing10TradeAction,severity:String(row.severity??"green"),reasons:jsonArray(row.reasons_json),alertTradeDate:text(row.alert_trade_date),
  }));
  const history=historyResult.rows;
  const realPerf=performance(history,"real"),testPerf=performance(history,"test");
  return {
    ok:true,version:VERSION,tradeDate:tradeDate||null,active,
    summary:{
      realOpen:active.filter(x=>x.holdingType==="real").length,
      testOpen:active.filter(x=>x.holdingType==="test").length,
      sellCheck:active.filter(x=>x.action==="sell_check").length,
      watch:active.filter(x=>x.action==="watch").length,
      hold:active.filter(x=>x.action==="hold").length,
      real:realPerf,test:testPerf,
    },
  };
}
