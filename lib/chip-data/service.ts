import { randomUUID } from "node:crypto";
import { calculateOwnershipStructureScore, sharesToLots } from "@/lib/smart-selection/scoring";
import { createTursoDatabase } from "@/lib/database/createTursoDatabase";
import type { DatabaseAdapter, DatabaseRow } from "@/lib/database";
import { MigrationRunner } from "@/migrations/database/MigrationRunner";
import { tursoMigrations } from "@/migrations/turso";
import { fetchForeignHolding, fetchTdccDistribution, fetchTrustTrading, type DistributionLevelRow } from "./providers";
import { aggregateDistribution, ownershipCompleteness } from "./ownership";

export type ChipSyncType = "foreign_holding" | "trust" | "distribution" | "all";
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (days: number) => { const date = new Date(); date.setUTCDate(date.getUTCDate() - days); return date.toISOString().slice(0, 10); };
const n = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

async function database() { const db = createTursoDatabase(); await new MigrationRunner(db, tursoMigrations).migrate(); return db; }

async function symbolsOrPriority(db: DatabaseAdapter, symbols?: string[], limit = 30) {
  if (symbols?.length) return [...new Set(symbols.map(String).filter((symbol) => /^\d{4,6}$/.test(symbol)))];
  const result = await db.execute<{ symbol: string }>({
    sql: `SELECT symbol FROM foreign_accumulation_latest WHERE data_days>=10 ORDER BY accumulation_score DESC LIMIT ?`, args: [limit],
  });
  return result.rows.map((row) => String(row.symbol));
}

async function beginRun(db: DatabaseAdapter, type: string, count: number) {
  const id = randomUUID(), now = new Date().toISOString();
  await db.execute({ sql: `INSERT INTO chip_data_sync_runs(id,sync_type,status,requested_symbols,started_at,updated_at) VALUES(?,?,?,?,?,?)`, args: [id,type,"running",count,now,now] });
  return id;
}
async function progress(db: DatabaseAdapter, id: string, processed: number, success: number, failed: number, symbol: string | null, error?: string | null) {
  await db.execute({ sql: `UPDATE chip_data_sync_runs SET processed_symbols=?,success_symbols=?,failed_symbols=?,current_symbol=?,last_error=?,updated_at=? WHERE id=?`, args: [processed,success,failed,symbol,error?.slice(0,900) ?? null,new Date().toISOString(),id] });
}
async function finish(db: DatabaseAdapter, id: string, success: number, failed: number) {
  const now = new Date().toISOString(); await db.execute({ sql: `UPDATE chip_data_sync_runs SET status='completed',success_symbols=?,failed_symbols=?,completed_at=?,updated_at=? WHERE id=?`, args: [success,failed,now,now,id] });
}

export async function syncForeignHolding(symbols?: string[], options: { targetTradeDate?: string; skipCurrent?: boolean } = {}) {
  const db = await database(); const selected = await symbolsOrPriority(db,symbols); const id = await beginRun(db,"foreign_holding",selected.length);
  let success=0,failed=0; const errors: Record<string,string> = {};
  const endDate = options.targetTradeDate ?? today();
  for (const symbol of selected) {
    try {
      const checkpoint = await db.execute<DatabaseRow>({ sql: "SELECT trade_date AS latest FROM institutional_holding_daily WHERE symbol=? AND foreign_holding_pct IS NOT NULL ORDER BY trade_date DESC LIMIT 1", args:[symbol] });
      const latest = checkpoint.rows[0]?.latest ? String(checkpoint.rows[0].latest) : null;
      if (options.skipCurrent && latest && latest >= endDate) {
        success += 1;
        await progress(db,id,success+failed,success,failed,symbol,null);
        continue;
      }
      const start = latest ? (()=>{const d=new Date(`${latest}T00:00:00Z`);d.setUTCDate(d.getUTCDate()-5);return d.toISOString().slice(0,10)})() : daysAgo(120);
      const rows = await fetchForeignHolding(symbol,start,endDate); const now = new Date().toISOString();
      if (!rows.length) throw new Error("FinMind 未回傳外資持股資料");
      await db.executeMany(rows.map((row)=>({ sql:`INSERT INTO institutional_holding_daily(symbol,trade_date,foreign_holding_pct,foreign_net_shares,trust_net_shares,dealer_net_shares,source,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(symbol,trade_date) DO UPDATE SET foreign_holding_pct=excluded.foreign_holding_pct,source=excluded.source,updated_at=excluded.updated_at`, args:[symbol,row.tradeDate,row.holdingPct,null,null,null,row.source,now] })));
      success += 1;
    } catch(error){failed+=1;errors[symbol]=error instanceof Error?error.message:String(error);} await progress(db,id,success+failed,success,failed,symbol,errors[symbol]);
  }
  await rebuildOwnershipLatest(db,selected); await finish(db,id,success,failed); return {ok:true,runId:id,type:"foreign_holding",total:selected.length,success,failed,errors};
}

export async function syncTrustTrading(symbols?: string[]) {
  const db=await database(); const selected=await symbolsOrPriority(db,symbols); const id=await beginRun(db,"trust",selected.length); let success=0,failed=0; const errors:Record<string,string>={};
  for(const symbol of selected){try{
    // M8.10.9: bounded 20-row checkpoint instead of COUNT(*) over all trust history.
    const checkpoint=await db.execute<DatabaseRow>({
      sql:"SELECT trade_date FROM institutional_holding_daily WHERE symbol=? AND trust_net_shares IS NOT NULL ORDER BY trade_date DESC LIMIT 20",
      args:[symbol],
    });
    const latest=checkpoint.rows[0]?.trade_date?String(checkpoint.rows[0].trade_date):null; const count=checkpoint.rows.length;
    const start=latest&&count>=20?(()=>{const d=new Date(`${latest}T00:00:00Z`);d.setUTCDate(d.getUTCDate()-5);return d.toISOString().slice(0,10)})():daysAgo(90);
    const rows=await fetchTrustTrading(symbol,start,today()); const now=new Date().toISOString(); if(!rows.length)throw new Error("FinMind 未回傳投信資料");
    await db.executeMany(rows.map((row)=>({sql:`INSERT INTO institutional_holding_daily(symbol,trade_date,foreign_holding_pct,foreign_net_shares,trust_net_shares,dealer_net_shares,source,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(symbol,trade_date) DO UPDATE SET foreign_net_shares=excluded.foreign_net_shares,trust_net_shares=excluded.trust_net_shares,dealer_net_shares=excluded.dealer_net_shares,source=excluded.source,updated_at=excluded.updated_at`,args:[symbol,row.tradeDate,null,row.foreignNet,row.trustNet,row.dealerNet,row.source,now]}))); success+=1;
  }catch(error){failed+=1;errors[symbol]=error instanceof Error?error.message:String(error);}await progress(db,id,success+failed,success,failed,symbol,errors[symbol]);}
  await rebuildOwnershipLatest(db,selected);await finish(db,id,success,failed);return{ok:true,runId:id,type:"trust",total:selected.length,success,failed,errors};
}


export async function syncShareholderDistribution(symbols?: string[]) {
  const db = await database();
  const selected = await symbolsOrPriority(db, symbols);
  const id = await beginRun(db, "distribution", selected.length);
  let success = 0, failed = 0;
  const errors: Record<string, string> = {};

  // M8.9.9：只呼叫一次 TDCC 官方免費 OpenAPI/CSV，整包下載後在記憶體分組。
  // 不再使用 FinMind TaiwanStockHoldingSharesPer，避免任何付費會員需求。
  let tdccRows: DistributionLevelRow[];
  try {
    tdccRows = await fetchTdccDistribution(selected);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    for (const symbol of selected) {
      errors[symbol] = message;
      failed += 1;
      await progress(db, id, success + failed, success, failed, symbol, message);
    }
    await finish(db, id, success, failed);
    return { ok: false, runId: id, type: "distribution", total: selected.length, success, failed, errors };
  }

  const tdccMap = new Map<string, DistributionLevelRow[]>();
  for (const row of tdccRows) {
    const list = tdccMap.get(row.symbol) ?? [];
    list.push(row);
    tdccMap.set(row.symbol, list);
  }

  for (const symbol of selected) {
    try {
      const rows = tdccMap.get(symbol) ?? [];
      if (!rows.length) throw new Error("TDCC 官方開放資料未包含此證券代號");

      const dates = [...new Set(rows.map((row) => row.reportDate))].sort().reverse();
      if (!dates.length) throw new Error("TDCC 股權分散資料缺少資料日期");
      const now = new Date().toISOString();

      // OpenAPI 通常提供最新一期；若來源同時含歷史週資料，最多保留近 26 期。
      for (const date of dates.slice(0, 26)) {
        const datedRows = rows.filter((row) => row.reportDate === date);
        const summary = aggregateDistribution(datedRows);
        if (!summary.valid) {
          throw new Error(`TDCC 股權分散校驗失敗 ${date}: ${summary.validationMessage}（有效 ${summary.acceptedRows} 段/忽略 ${summary.ignoredRows} 段）`);
        }
        await db.execute({
          sql: `INSERT INTO shareholding_distribution_weekly(symbol,report_date,retail_proxy_pct,medium_holder_pct,large_holder_pct,super_holder_pct,shareholder_count,source,updated_at)
            VALUES(?,?,?,?,?,?,?,?,?)
            ON CONFLICT(symbol,report_date) DO UPDATE SET
              retail_proxy_pct=excluded.retail_proxy_pct,
              medium_holder_pct=excluded.medium_holder_pct,
              large_holder_pct=excluded.large_holder_pct,
              super_holder_pct=excluded.super_holder_pct,
              shareholder_count=excluded.shareholder_count,
              source=excluded.source,
              updated_at=excluded.updated_at`,
          args: [symbol, date, summary.retailProxyPct, summary.mediumHolderPct, summary.largeHolderPct, summary.superHolderPct, summary.shareholderCount, datedRows[0]?.source ?? "tdcc:openapi:1-5", now],
        });
      }
      success += 1;
    } catch (error) {
      failed += 1;
      errors[symbol] = error instanceof Error ? error.message : String(error);
    }
    await progress(db, id, success + failed, success, failed, symbol, errors[symbol]);
  }

  await rebuildOwnershipLatest(db, selected);
  await finish(db, id, success, failed);
  return { ok: failed === 0, runId: id, type: "distribution", total: selected.length, success, failed, errors };
}

export async function rebuildOwnershipLatest(db: DatabaseAdapter, symbols: string[]) {
  const now = new Date().toISOString();
  for (const symbol of symbols) {
    const inst = await db.execute<DatabaseRow>({
      sql: "SELECT trade_date,foreign_holding_pct,trust_net_shares FROM institutional_holding_daily WHERE symbol=? ORDER BY trade_date DESC LIMIT 20",
      args: [symbol],
    });
    const dist = await db.execute<DatabaseRow>({
      sql: "SELECT * FROM shareholding_distribution_weekly WHERE symbol=? ORDER BY report_date DESC LIMIT 2",
      args: [symbol],
    });

    const trustRows = inst.rows.filter((row) => row.trust_net_shares != null);
    const foreignRows = inst.rows.filter((row) => row.foreign_holding_pct != null);
    const trust = (days: number) => trustRows.length >= days
      ? trustRows.slice(0, days).reduce((sum, row) => sum + n(row.trust_net_shares), 0)
      : null;
    const fh = foreignRows[0];
    const fhPrevious = foreignRows[1];
    const current = dist.rows[0];
    const previous = dist.rows[1];

    const foreignPct = fh?.foreign_holding_pct == null ? null : n(fh.foreign_holding_pct);
    const rawLarge = current?.large_holder_pct == null ? null : n(current.large_holder_pct);
    const rawRetail = current?.retail_proxy_pct == null ? null : n(current.retail_proxy_pct);
    const distributionValid = rawLarge != null && rawRetail != null
      && rawLarge >= 0 && rawLarge <= 100
      && rawRetail >= 0 && rawRetail <= 100
      && Math.abs((rawLarge + rawRetail) - 100) <= 0.2;
    const large = distributionValid ? rawLarge : null;
    const retail = distributionValid ? rawRetail : null;
    const trust10 = trust(10);
    const completeness = ownershipCompleteness({
      foreignHoldingPct: foreignPct,
      trust10,
      largeHolderPct: large,
      retailProxyPct: retail,
      distributionValid,
    });

    const scoreBreakdown = calculateOwnershipStructureScore({
      foreignHoldingPct: foreignPct,
      largeHolderPct: large,
      retailPct: retail,
      distributionValid,
    });
    const score = scoreBreakdown.score;
    const reasons = [
      foreignPct == null ? "外資持股比例尚未取得" : `外資持股 ${foreignPct.toFixed(2)}%`,
      trust10 == null ? "投信資料不足" : `投信10日 ${(sharesToLots(trust10) ?? 0).toLocaleString("zh-TW", { maximumFractionDigits: 3 })} 張`,
      large == null ? "股權分散資料待重新同步/校驗" : `大戶比例 ${large.toFixed(2)}%`,
      retail == null ? "散戶比例待重新同步/校驗" : `散戶比例 ${retail.toFixed(2)}%`,
      `資料完整度 ${completeness}%`,
    ];
    const stage = foreignPct == null && large == null
      ? "資料不足"
      : trust10 != null && trust10 > 0
        ? "法人接力"
        : large != null && large >= 55
          ? "籌碼集中"
          : "資金觀察";

    await db.execute({
      sql: `INSERT INTO ownership_structure_latest(
        symbol,data_date,foreign_holding_pct,foreign_holding_change,
        trust_5,trust_10,trust_20,large_holder_pct,large_holder_change,
        retail_proxy_pct,retail_proxy_change,shareholder_count,shareholder_count_change,
        ownership_score,capital_stage,tags_json,reasons_json,calculated_at,
        distribution_valid,data_completeness_pct,validation_message
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(symbol) DO UPDATE SET
        data_date=excluded.data_date,
        foreign_holding_pct=excluded.foreign_holding_pct,
        foreign_holding_change=excluded.foreign_holding_change,
        trust_5=excluded.trust_5,trust_10=excluded.trust_10,trust_20=excluded.trust_20,
        large_holder_pct=excluded.large_holder_pct,large_holder_change=excluded.large_holder_change,
        retail_proxy_pct=excluded.retail_proxy_pct,retail_proxy_change=excluded.retail_proxy_change,
        shareholder_count=excluded.shareholder_count,shareholder_count_change=excluded.shareholder_count_change,
        ownership_score=excluded.ownership_score,capital_stage=excluded.capital_stage,
        tags_json=excluded.tags_json,reasons_json=excluded.reasons_json,calculated_at=excluded.calculated_at,
        distribution_valid=excluded.distribution_valid,
        data_completeness_pct=excluded.data_completeness_pct,
        validation_message=excluded.validation_message`,
      args: [
        symbol,
        String(fh?.trade_date ?? current?.report_date ?? today()),
        foreignPct,
        fhPrevious && foreignPct != null ? foreignPct - n(fhPrevious.foreign_holding_pct) : null,
        trust(5),trust10,trust(20),
        large,
        previous && large != null && n(previous.large_holder_pct) >= 0 && n(previous.large_holder_pct) <= 100
          ? large - n(previous.large_holder_pct) : null,
        retail,
        previous && retail != null && n(previous.retail_proxy_pct) >= 0 && n(previous.retail_proxy_pct) <= 100
          ? retail - n(previous.retail_proxy_pct) : null,
        current?.shareholder_count ?? null,
        previous && current ? n(current.shareholder_count) - n(previous.shareholder_count) : null,
        score,stage,
        JSON.stringify([foreignPct != null ? "外資持股" : "", large != null ? "股權集中" : ""].filter(Boolean)),
        JSON.stringify(reasons),now,
        distributionValid ? 1 : 0,completeness,
        distributionValid ? "OK" : "股權分散比例異常，請重新同步 TDCC 資料",
      ],
    });
  }
}

export async function syncAllChipData(symbols?: string[]) { const trust=await syncTrustTrading(symbols);const foreign=await syncForeignHolding(symbols);const distribution=await syncShareholderDistribution(symbols);return{ok:true,trust,foreign,distribution}; }

/**
 * M8.10.20 candidate-only chip refresh.
 * Trust/dealer/foreign net flow is already loaded market-wide by the daily bulk
 * snapshot, so post-processing must not download the same institutional dataset
 * another 40 times. Only foreign holding ratio (candidate-only) and the single
 * TDCC distribution bundle remain as external enrichment.
 */
export async function syncCandidateChipDataEfficient(symbols: string[], targetTradeDate: string) {
  const selected = [...new Set(symbols.map(String).filter((symbol) => /^\d{4,6}$/.test(symbol)))];
  const trust = { ok: true, type: "trust", total: selected.length, success: selected.length, failed: 0, reusedBulkSnapshot: true, errors: {} as Record<string,string> };
  const foreign = await syncForeignHolding(selected, { targetTradeDate, skipCurrent: true });
  const distribution = await syncShareholderDistribution(selected);
  return { ok: true, trust, foreign, distribution, mode: "bulk-reuse" };
}
export async function readChipSyncStatus(){const db=await database();const result=await db.execute<DatabaseRow>({sql:"SELECT * FROM chip_data_sync_runs ORDER BY started_at DESC LIMIT 12"});return result.rows;}
