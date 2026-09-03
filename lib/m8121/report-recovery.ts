import { TursoDatabaseAdapter } from "@/adapters/turso";
import { getTursoClient } from "@/lib/turso";
import { MigrationRunner } from "@/migrations/database/MigrationRunner";
import { tursoMigrations } from "@/migrations/turso";
import { resolveEffectiveTradingDate } from "@/lib/development/trading-date";
import { generateDailyIntegratedReport } from "@/lib/daily-report/service";
import { refreshBruceSwingScores } from "./bruce-swing-score";
import { refreshM8121DataQuality } from "./quality-service";

export async function recoverM8121DailyReport(requestedDate?:string|null){
  const db=new TursoDatabaseAdapter(getTursoClient());
  await new MigrationRunner(db,tursoMigrations).migrate();

  const trading=await resolveEffectiveTradingDate();
  const tradeDate=requestedDate&&/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
    ? requestedDate : trading.effectiveTradingDate;

  let quality=await refreshM8121DataQuality(db,tradeDate);
  if(quality.publishMode==="blocked"){
    return {ok:false,recovered:false,reason:"price_core_blocked",quality};
  }

  // 不使用 M8.11.11 daily_job_lock；直接由已保存資料產生正式/降級日報。
  const report=await generateDailyIntegratedReport(db,tradeDate);
  await refreshBruceSwingScores(db,tradeDate).catch(()=>undefined);
  quality=await refreshM8121DataQuality(db,tradeDate);

  return {
    ok:true,recovered:true,version:"M8.12.3",tradeDate,
    publishMode:quality.publishMode,quality,
    report:{reportDate:report.reportDate,headline:report.conclusion.headline,fast5:report.fastTrack.top5.length},
  };
}
