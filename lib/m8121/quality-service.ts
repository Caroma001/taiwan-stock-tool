import type { DatabaseAdapter, DatabaseRow } from "@/lib/database";
import { evaluateM8121DataQuality } from "./data-quality";
import type { DataSourceQuality } from "./types";

const n=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0;
const txt=(v:unknown)=>v==null||String(v).trim()===""?null:String(v);

export async function readM8121DataQuality(db:DatabaseAdapter,tradeDate:string){
  const result=await db.execute<DatabaseRow>({
    sql:`SELECT
      b.trade_date AS bulk_date,b.status AS bulk_status,b.price_rows,b.institutional_rows,
      r.trade_date AS risk_date,r.status AS risk_status,r.margin_rows,r.index_rows,
      e.trade_date AS ew_date,e.status AS ew_status,e.revenue_rows,
      m.regime_date AS market_date,
      rep.report_date
    FROM (SELECT ? AS wanted_date) x
    LEFT JOIN daily_bulk_snapshot_runs b ON b.trade_date=x.wanted_date
    LEFT JOIN public_risk_snapshot_runs r ON r.trade_date=x.wanted_date
    LEFT JOIN (
      SELECT trade_date,status,revenue_rows FROM early_watch_refresh_runs
      WHERE trade_date<=? ORDER BY trade_date DESC LIMIT 1
    ) e ON 1=1
    LEFT JOIN (
      SELECT regime_date FROM market_regime_daily
      WHERE regime_date<=? ORDER BY regime_date DESC LIMIT 1
    ) m ON 1=1
    LEFT JOIN daily_analysis_reports rep ON rep.report_date=x.wanted_date
    LIMIT 1`,
    args:[tradeDate,tradeDate,tradeDate],
  });
  const row=result.rows[0]??({} as DatabaseRow);

  const sources:DataSourceQuality[]=[
    {key:"price",ok:n(row.price_rows)>=1500,rows:n(row.price_rows),minRows:1500,status:txt(row.bulk_status)??"missing",message:n(row.price_rows)>=1500?null:"核心價格快照不足"},
    {key:"institutional",ok:n(row.institutional_rows)>=1200,rows:n(row.institutional_rows),minRows:1200,status:txt(row.bulk_status)??"missing",message:n(row.institutional_rows)>=1200?null:"法人不足，允許降級日報"},
    {key:"margin",ok:n(row.margin_rows)>=20,rows:n(row.margin_rows),minRows:20,status:txt(row.risk_status)??"missing",message:n(row.margin_rows)>=20?null:"候選融資券不足，採中性權重"},
    {key:"fundamental",ok:n(row.revenue_rows)>=800,rows:n(row.revenue_rows),minRows:800,status:txt(row.ew_status)??"missing",message:n(row.revenue_rows)>=800?null:"月營收覆蓋不足，採既有快照"},
    {key:"market",ok:Boolean(txt(row.market_date))||n(row.index_rows)>=1,rows:Math.max(txt(row.market_date)?1:0,n(row.index_rows)),minRows:1,status:txt(row.risk_status)??(txt(row.market_date)?"ready":"missing"),message:Boolean(txt(row.market_date))||n(row.index_rows)>=1?null:"市場環境不足，降低信心"},
  ];

  return evaluateM8121DataQuality({
    tradeDate,
    reportExists:txt(row.report_date)===tradeDate,
    sourceDates:{
      bulk:txt(row.bulk_date),
      risk:txt(row.risk_date),
      fundamental:txt(row.ew_date),
      market:txt(row.market_date),
      report:txt(row.report_date),
    },
    sources,
  });
}

export async function refreshM8121DataQuality(db:DatabaseAdapter,tradeDate:string){
  const q=await readM8121DataQuality(db,tradeDate);
  const now=new Date().toISOString();
  await db.execute({
    sql:`INSERT INTO daily_quality_snapshots(
      trade_date,score,level,publish_mode,report_exists,quality_json,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(trade_date) DO UPDATE SET
      score=excluded.score,level=excluded.level,publish_mode=excluded.publish_mode,
      report_exists=excluded.report_exists,quality_json=excluded.quality_json,updated_at=excluded.updated_at`,
    args:[q.tradeDate,q.score,q.level,q.publishMode,q.reportExists?1:0,JSON.stringify(q),now,now],
  });
  return q;
}
