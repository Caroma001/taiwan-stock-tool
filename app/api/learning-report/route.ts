import { NextResponse } from "next/server";
import { getTursoClient } from "@/lib/turso/client";
export const dynamic="force-dynamic";
const n=(v:unknown)=>Number(v??0);
export async function GET(){
 try{
  const c=getTursoClient();
  const [settings,latest,history,regimes]=await Promise.all([
   c.execute(`SELECT * FROM algorithm_settings WHERE id=1`),
   c.execute(`SELECT * FROM validation_metrics_daily ORDER BY metric_date DESC LIMIT 1`),
   c.execute(`SELECT * FROM validation_metrics_daily ORDER BY metric_date DESC LIMIT 30`),
   c.execute(`SELECT COALESCE(market_regime,'未知') market_regime,COUNT(*) samples,AVG(return_pct) average_return,SUM(CASE WHEN result_status IN ('第一目標達成','第二目標達成','到期獲利') THEN 1 ELSE 0 END) wins FROM validation_snapshots GROUP BY COALESCE(market_regime,'未知') ORDER BY samples DESC`)
  ]);
  const s=settings.rows[0]??{};let weights={};try{weights=JSON.parse(String(s.weights_json??"{}"))}catch{}
  const l=latest.rows[0]??{};
  return NextResponse.json({ok:true,settings:{algorithmVersion:String(s.algorithm_version??"RULES-1"),validationHorizonDays:n(s.validation_horizon_days),weights},summary:{totalSamples:n(l.total_samples),activeSamples:n(l.active_samples),completedSamples:n(l.completed_samples),winningSamples:n(l.winning_samples),winRate:n(l.win_rate),averageReturn:n(l.average_return),averageMaxGain:n(l.average_max_gain),averageMaxDrawdown:n(l.average_max_drawdown),marketRegime:String(l.market_regime??"—"),metricDate:String(l.metric_date??"")},history:history.rows,regimes:regimes.rows});
 }catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:String(e)},{status:500});}
}
