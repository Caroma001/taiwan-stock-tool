import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const failures = [];
const pass = (condition, message) => { if (!condition) failures.push(message); };

const jobs = read("lib/cloud/jobs.ts");
const pipeline = read("services/scoring/MarketPipeline.ts");
const syncStatus = read("app/api/sync-status/route.ts");
const maintenance = read("app/api/database-maintenance/status/route.ts");
const foreign = read("lib/foreign-accumulation/service.ts");
const smart = read("lib/smart-selection/service.ts");
const progress = read("components/update/GlobalUpdateProgress.tsx");
const statusRoute = read("app/api/development/update/status/route.ts");
const updateService = read("lib/development/update-service.ts");
const activeJob = read("lib/cloud/active-job.ts");
const winner = read("lib/winner25/service.ts");

pass(!/SUM\s*\(\s*CASE[\s\S]{0,1200}FROM cloud_update_items/i.test(jobs),
  "cloud worker must not aggregate the entire cloud_update_items queue on every batch");
pass(/processed_symbols=processed_symbols\+1/.test(jobs),
  "cloud job terminal counters must be maintained incrementally");
pass(/status='running' AND updated_at<\?/.test(jobs),
  "only stale running queue claims may be recovered");

pass(/stock_sync_checkpoint/.test(pipeline),
  "market pipeline must use stock_sync_checkpoint");
pass(!/SELECT MAX\(trade_date\).*FROM daily_prices/.test(pipeline),
  "market pipeline must not MAX-scan daily_prices for its checkpoint");
pass(!/calculateBreakoutScoreForSymbol/.test(pipeline),
  "full-market pipeline must not calculate Winner25 for every stock");

pass(!/FROM daily_prices/i.test(syncStatus),
  "live sync-status endpoint must not scan daily_prices");
pass(!/COUNT\(\*\).*\$\{name\}/s.test(maintenance),
  "database health page must not COUNT every table");
pass(/estimated_rows: null/.test(maintenance),
  "database health page should expose read-saving metadata mode");

pass(!/WHERE symbol IN \(\$\{missing\.map[\s\S]*ORDER BY symbol,trade_date DESC/.test(foreign),
  "foreign snapshot repair must not read unbounded history for all missing symbols");
pass(/LIMIT 60/.test(foreign) && /LIMIT 61/.test(foreign),
  "foreign snapshot repair should use bounded history windows");

pass(/ownership_structure_latest WHERE symbol IN/.test(smart),
  "smart selection must scope ownership reads to candidate symbols");
pass(!/SELECT \* FROM ownership_structure_latest`/.test(smart),
  "smart selection must not read the whole ownership table");

const pollMatch = progress.match(/const STATUS_POLL_MS\s*=\s*([\d_]+)/);
const pollMs = pollMatch ? Number(pollMatch[1].replaceAll("_", "")) : 0;
pass(pollMs >= 10000, "global status polling must be >= 10 seconds");
pass(/claimUpdateStatusLeader/.test(progress),
  "only one browser tab should lead status polling");
pass(/SERVER_STATUS_CACHE_MS/.test(statusRoute),
  "server status endpoint should collapse duplicate warm-instance reads");


pass(/orphanReason/.test(updateService) && /total_symbols/.test(updateService),
  "daily update start must detect orphan 0/0 jobs");
pass(/SELECT symbol FROM cloud_update_items WHERE job_id=\? LIMIT 1/.test(updateService),
  "orphan validation must use a LIMIT 1 queue probe instead of COUNT(*)");
pass(/post-build guard/i.test(updateService) && /createdTotal <= 0/.test(updateService),
  "daily job creation must reject another 0/0 orphan before queue publish");

pass(/resolveActiveDevelopmentJob/.test(updateService) && /unifiedCloudStatusFromActive\(active\)/.test(updateService),
  "development status must derive progress directly from the persisted active pointer row");
pass(!/getCloudStatus\(\{ jobId: active\.jobId \}\)/.test(updateService),
  "M8.10.22 unified status must not perform a second cloud job lookup");
pass(/LEFT JOIN daily_update_pipeline_state p ON p\.job_id=a\.job_id/.test(activeJob),
  "active pointer read must join pipeline identity for one-row unified progress");
pass(/jobDate\?: string \| null/.test(jobs) && /WHERE job_date=\? LIMIT 1/.test(jobs),
  "cloud status helper must support an exact jobDate single-row lookup");

pass(!/SELECT MAX\(trade_date\) AS latest_date FROM daily_prices/.test(winner),
  "Winner25 model start should use compact latest metadata, not MAX daily_prices");
pass(/indicator_latest WHERE symbol=\? LIMIT 1/.test(winner),
  "Winner25 live scoring should get as-of date from indicator_latest");

// M8.10.22 unified-progress source-of-truth guard.
for (const token of [
  "active_development_job",
  "persistActiveDevelopmentJob",
  "resolveActiveDevelopmentJob",
  "queue_job_id",
]) {
  if (!activeJob.includes(token)) {
    failures.push(`M8.10.22 active-job source-of-truth missing: ${token}`);
  }
}
if (!updateService.includes('statusSource: "unified_active_pointer"')) {
  failures.push("M8.10.22 development status must expose unified_active_pointer source");
}
pass(!/cloud_update_jobs[\s\S]{0,240}ORDER BY updated_at DESC LIMIT 1/i.test(activeJob),
  "active-job resolver must never guess cloud_update_jobs source of truth by latest updated_at");
pass(/Expensive aggregate is used only if/.test(activeJob),
  "active-job diagnostics must keep queue aggregates off the normal hot path");

if (failures.length) {
  console.error("❌ Turso read-budget regression check failed:");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("✅ M8.10.22 Turso read-budget base guard passed.");

// M8.10.22 front-end canonical binding guard.
const uiNormalizer = read("lib/client/normalize-update-status.ts");
const developmentPage = read("app/development-center/page.tsx");
const statusChannel = read("lib/client/update-status-channel.ts");
for (const token of [
  "normalizeUnifiedUpdateStatus",
  "M8.10.22-durable-recovery-v2",
]) {
  if (!uiNormalizer.includes(token)) failures.push(`M8.10.22 UI normalizer missing: ${token}`);
}
if (!developmentPage.includes("normalizeUnifiedUpdateStatus")) {
  failures.push("M8.10.22 Development Center must normalize status before rendering");
}
if (!statusChannel.includes("m8.10.22")) {
  failures.push("M8.10.22 status cache/channel namespace must isolate previous versions");
}

// Compile-contract guard: GlobalUpdateProgress still renders status.last_error.
const m81020Progress = read("components/update/GlobalUpdateProgress.tsx");
if (m81020Progress.includes("status.last_error") && !uiNormalizer.includes("last_error?:")) {
  failures.push("M8.10.22 UnifiedUpdateStatus must preserve last_error compatibility");
}

// High Efficiency Bulk Engine guards.
const bulkEngine = read("lib/development/bulk-daily-engine.ts");
const marketPipelineM81020 = read("services/scoring/MarketPipeline.ts");
const updateServiceM81020 = read("lib/development/update-service.ts");
const jobsM81020 = read("lib/cloud/jobs.ts");
const foreignM81020 = read("lib/foreign-accumulation/service.ts");
for (const token of [
  "daily_bulk_snapshot_runs",
  "fetchOfficialSnapshot",
  "TaiwanStockInstitutionalInvestorsBuySell",
  "claimSnapshotLease",
  "externalRequests",
  "refreshForeignAccumulationBulk",
]) {
  if (!bulkEngine.includes(token)) failures.push(`M8.10.22 bulk engine missing: ${token}`);
}
if (!foreignM81020.includes("refreshForeignAccumulationBulk") || !foreignM81020.includes("chunkSize")) {
  failures.push("M8.10.22 foreign accumulation must rebuild in chunked market batches");
}
if (!marketPipelineM81020.includes("bulkSnapshotReady") || !marketPipelineM81020.includes("targetTradeDate")) {
  failures.push("M8.10.22 MarketPipeline must use immutable targetTradeDate + bulkSnapshotReady");
}
if (!marketPipelineM81020.includes("bulk engine already calculated foreign_accumulation_latest")) {
  failures.push("M8.10.22 per-symbol pipeline must not reread foreign history after bulk scoring");
}
if (!updateServiceM81020.includes("syncCandidateChipDataEfficient")) {
  failures.push("M8.10.22 postprocess must reuse bulk institutional snapshot for candidate chip data");
}
if (!jobsM81020.includes("ensureDailyBulkSnapshot") || !jobsM81020.includes("bulkSnapshotReady:true")) {
  failures.push("M8.10.22 cloud worker must hydrate one bulk snapshot before per-symbol analysis");
}
if (!developmentPage.includes("15_000") || !developmentPage.includes("Bulk Engine")) {
  failures.push("M8.10.22 Development Center must use reliable 15s unified-status polling and show bulk telemetry");
}

if (failures.length) {
  console.error("\n❌ M8.10.22 High Efficiency Bulk Engine guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("✅ M8.10.22 High Efficiency Bulk Engine guard passed.");
// M8.10.22 durable Queue heartbeat guard.
const m81021QueueRoute = read("app/api/queues/twstock-daily-update/route.ts");
const m81021QueueRuntime = read("lib/vercel/queue-runtime.ts");
const m81021Resume = read("app/api/development/update/resume/route.ts");
for (const token of [
  "claimWorkMessage",
  "recordQueueHeartbeat",
  "SAFETY_NET_DELAY_SECONDS",
  "watchContinuationId",
]) {
  if (!m81021QueueRoute.includes(token)) failures.push(`M8.10.22 queue callback missing: ${token}`);
}
for (const token of [
  "daily_queue_runtime",
  "claimQueueRecoveryLease",
  "recovery_lease_until",
]) {
  if (!m81021QueueRuntime.includes(token)) failures.push(`M8.10.22 queue runtime missing: ${token}`);
}
if (m81021Resume.includes("getCloudUpdateDiagnostics")) {
  failures.push("M8.10.22 resume must not scan item diagnostics just to decide Queue recovery");
}
if (failures.length) {
  console.error("\n❌ M8.10.22 Durable Queue Base guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("✅ M8.10.22 Durable Queue Base guard passed.");
// M8.10.22 Durable Queue Recovery v2 guard.
const m81022QueueRoute = read("app/api/queues/twstock-daily-update/route.ts");
const m81022QueueRuntime = read("lib/vercel/queue-runtime.ts");
const m81022Migration = read("migrations/turso/0032_durable_queue_recovery_v2.ts");

for (const token of [
  "watchContinuationId: nextContinuationId",
  "successor_not_consumed",
  "successor_not_published",
  "watchGeneration",
  "QueueContinuationSupersededError",
  "claimQueueRecoveryLease",
]) {
  if (!m81022QueueRoute.includes(token)) {
    failures.push(`M8.10.22 Recovery v2 callback missing: ${token}`);
  }
}

for (const token of [
  "generation",
  "consumed_continuation_id",
  "heartbeat_continuation_id",
  "recovery_count",
  "expectedGeneration",
  "expectedContinuationId",
]) {
  if (!m81022QueueRuntime.includes(token)) {
    failures.push(`M8.10.22 Queue generation fence missing: ${token}`);
  }
}

if (!m81022Migration.includes("durable_queue_recovery_v2_m81022")) {
  failures.push("M8.10.22 migration 0032 missing");
}

if (
  m81022QueueRoute.includes(
    'runtimeState.continuationId !== watched'
  )
  && !m81022QueueRoute.includes(
    "watches the successor"
  )
) {
  failures.push("M8.10.22 safety-net must monitor successor, not merely accept a newer published continuation");
}

if (failures.length) {
  console.error("\n❌ M8.10.22 Durable Queue Recovery v2 guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("✅ M8.10.22 Durable Queue Recovery v2 guard passed.");


// M8.10.23 Stealth Data Completeness core guard (M8.11.3 UI cleanup).
const m81023Features = read("lib/winner25/features.ts");
const m81023Stealth = read("lib/institutional-stealth/service.ts");
if (!m81023Features.includes("latest VALID net-flow observations")) failures.push("M8.10.23 must ignore holding-only NULL rows for 5/10/20 institutional flow");
if (!m81023Stealth.includes("auxiliaryMissingData") || !m81023Stealth.includes("missing_json=?")) failures.push("M8.10.23 must persist one unified stealth missing-data source");
if (/FinMind/i.test(m81023Stealth)) failures.push("Institutional stealth scoring must remain local-history only; do not add per-symbol FinMind calls");
if (failures.length) { console.error("\n❌ M8.10.23 Stealth Data Completeness core guard failed:"); for (const failure of failures) console.error(`- ${failure}`); process.exit(1); }
console.log("✅ M8.10.23 Stealth Data Completeness core guard passed.");

// M8.10.24 Risk & Margin Intelligence core guard.
const m81024RiskMigration = read("migrations/turso/0033_risk_margin_intelligence.ts");
const m81024RiskData = read("lib/risk-intelligence/public-data.ts");
const m81024RiskService = read("lib/risk-intelligence/service.ts");
const m81024SmartSelection = read("lib/smart-selection/service.ts");
const m81024Update = read("lib/development/update-service.ts");
const m81024Jobs = read("lib/cloud/jobs.ts");

for (const token of [
  "public_risk_snapshot_runs",
  "market_microstructure_daily",
  "market_index_daily",
  "risk_intelligence_latest",
]) if (!m81024RiskMigration.includes(token)) failures.push(`M8.10.24 risk migration missing: ${token}`);
if (/ALTER TABLE/i.test(m81024RiskMigration)) failures.push("M8.10.24 migration 33 must use additive CREATE TABLE only; do not repeat M8.10.22 schema drift risk");

for (const token of ["MI_MARGN","TWTB4U","margin_bal_result","intraday_trading_stat_result","MI_INDEX"]) {
  if (!m81024RiskData.includes(token)) failures.push(`M8.10.24 public risk Bulk source missing: ${token}`);
}
if (/FinMind/i.test(m81024RiskData)) failures.push("M8.10.24 risk public data layer must not fall back to FinMind/paid per-symbol APIs");

for (const token of [
  "calculateMarketRisk",
  "calculateMarginWashout",
  "calculateForeignPersistence",
  "calculateDaytradeNoise",
  "combineDecisionOverlay",
  "public_risk_snapshot_runs",
  "persistSymbols",
]) if (!m81024RiskService.includes(token)) failures.push(`M8.10.24 risk engine missing: ${token}`);
if (!m81024RiskService.includes("current Top40 universe is persisted")) failures.push("M8.10.24 must persist only bounded candidate microstructure rows, not ~2,000 rows/day");
if (!m81024SmartSelection.includes("decisionScore") || !m81024SmartSelection.includes("risk_intelligence_latest")) failures.push("M8.10.24 Smart Selection must rank by decisionScore with precomputed risk latest rows");
if (!m81024Update.includes("refreshCandidateRiskIntelligence")) failures.push("M8.10.24 risk refresh must remain in the unified daily pipeline after legacy Stealth page removal");
if (!m81024Jobs.includes('classification.category==="rate_limit" ? previousAttempts : attemptNumber')) failures.push("M8.10.24 must close the proven 402/429 attempts=4 dead zone");

if (failures.length) {
  console.error("\n❌ M8.10.24 Risk & Margin Intelligence core guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("✅ M8.10.24 Risk & Margin Intelligence core guard passed.");


// M8.10.25 Risk Intelligence Type Safety guard.
const m81025SmartSelection = read("lib/smart-selection/service.ts");
if (!m81025SmartSelection.includes("new Map<string,DatabaseRow>()")) {
  console.error("\n❌ M8.10.25 risk map must keep DatabaseRow as the explicit Map value type.");
  process.exit(1);
}
if (m81025SmartSelection.includes("new Map(riskRows.rows.map")) {
  console.error("\n❌ M8.10.25 must not use the inference-prone riskRows Map constructor.");
  process.exit(1);
}
console.log("✅ M8.10.25 Risk Intelligence Type Safety guard passed.");


// M8.10.26 Swing10 Close Review guard.
const m81026Migration = read("migrations/turso/0034_swing10_close_review.ts");
const m81026Service = read("lib/swing10/service.ts");
const m81026Reminder = read("app/components/Swing10CloseReminder.tsx");
const m81026Page = read("app/swing10/page.tsx");
for (const token of ["swing10_candidate_daily","swing10_daily_review","version: 34","SNAPSHOT_LIMIT = 20","A_GRADE_LIMIT = 5"]) {
  if (!(m81026Migration + m81026Service).includes(token)) failures.push(`M8.10.26 missing: ${token}`);
}
if (/ALTER TABLE/i.test(m81026Migration)) failures.push("M8.10.26 migration 34 must remain additive CREATE TABLE only");
if (!m81026Service.includes("首次建立 Swing10 基準") || !m81026Service.includes("decisionDelta1d") || !m81026Service.includes("riskChangeLevel")) failures.push("M8.10.26 must persist score/risk changes across trading-day snapshots");
if (!m81026Reminder.includes("30*60*1000") || !m81026Reminder.includes("localStorage")) failures.push("M8.10.26 reminder must be low-frequency and browser preference must remain local-only");
if (!m81026Page.includes("完成今日檢查") || !m81026Page.includes("A級候選")) failures.push("M8.10.26 Swing10 page must expose the daily close-review workflow");
if (failures.length) { console.error("\n❌ M8.10.26 Swing10 Close Review guard failed:"); for (const failure of failures) console.error(`- ${failure}`); process.exit(1); }
console.log("✅ M8.10.26 Swing10 Close Review guard passed.");

// M8.10.27 Swing10 Trade Execution & Exit Alerts guard.
const m81027Migration = read("migrations/turso/0035_swing10_trade_execution.ts");
const m81027TradeService = read("lib/swing10/trade-execution.ts");
const m81027ExitRules = read("lib/swing10/exit-rules.ts");
const m81027SwingPage = read("app/swing10/page.tsx");
const m81027TradeApi = read("app/api/swing10/trades/route.ts");
const m81027Reminder = read("app/api/swing10/reminder/route.ts");
for (const token of [
  "version: 35",
  "swing10_trade_positions",
  "swing10_exit_alert_daily",
  "take_profit_pct",
  "stop_loss_pct",
  "max_holding_days",
]) {
  if (!m81027Migration.includes(token)) failures.push(`M8.10.27 migration missing: ${token}`);
}
if (/ALTER TABLE/i.test(m81027Migration)) failures.push("M8.10.27 migration 35 must remain additive CREATE TABLE/INDEX only");
for (const token of ["createSwing10Trade","refreshSwing10ExitAlerts","sell_check","Time Stop","獲利保護","performance("]) {
  if (!(m81027TradeService + m81027ExitRules).includes(token)) failures.push(`M8.10.27 trade service missing: ${token}`);
}
if (!m81027SwingPage.includes("加入測試") || !m81027SwingPage.includes("實際買入") || !m81027SwingPage.includes("賣出檢查")) failures.push("M8.10.27 Swing10 page must expose test/real execution and exit alerts");
if (!m81027TradeApi.includes("holdingType") || !m81027TradeApi.includes("createSwing10Trade")) failures.push("M8.10.27 trade API missing execution binding");
if (!m81027Reminder.includes("sellCheckCount")) failures.push("M8.10.27 close reminder must include sell-check count");
if (failures.length) { console.error("\n❌ M8.10.27 Swing10 Trade Execution guard failed:"); for (const failure of failures) console.error(`- ${failure}`); process.exit(1); }
console.log("✅ M8.10.27 Swing10 Trade Execution & Exit Alerts guard passed.");


// M8.10.28 Swing10 PositionTable TypeScript build hotfix guard.
const m81028SwingPage = read("app/swing10/page.tsx");
if (m81028SwingPage.includes('fontWeight:900,color=(r.returnPct')) {
  failures.push("M8.10.28 Swing10 PositionTable still contains invalid style assignment color=");
}
if (!m81028SwingPage.includes('fontWeight:900,color:(r.returnPct')) {
  failures.push("M8.10.28 Swing10 PositionTable typed color property fix missing");
}
if (failures.length) {
  console.error("\n❌ M8.10.28 Swing10 TypeScript hotfix guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("✅ M8.10.28 Swing10 TypeScript build hotfix guard passed.");

// M8.10.29 Swing10 duplicate-test UI guard.
const m81029SwingPage = read("app/swing10/page.tsx");
for (const token of [
  "testHeldSymbols",
  "✅ 已加入測試",
  "disabled={testHeld}",
  "if(!testHeld)onTrade(r,\"test\")",
  "實際買入",
]) {
  if (!m81029SwingPage.includes(token)) failures.push(`M8.10.29 Swing10 duplicate-test UI guard missing: ${token}`);
}
if (failures.length) {
  console.error("\n❌ M8.10.29 Swing10 duplicate-test UI guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("✅ M8.10.29 Swing10 duplicate-test UI guard passed.");

// M8.11.1 Swing10 Opportunity Grade v2 + Position Continuity guard.
const m8111Opportunity = read("lib/swing10/opportunity-grade.ts");
const m8111Swing = read("lib/swing10/service.ts");
const m8111Trade = read("lib/swing10/trade-execution.ts");
const m8111Update = read("lib/development/update-service.ts");
const m8111Page = read("app/swing10/page.tsx");
const m8111Foreign = read("lib/foreign-accumulation/service.ts");
for (const token of ["A1", "A0", "marketPosture", "大盤風險", "首次強勢候選"]) {
  if (!m8111Opportunity.includes(token)) failures.push(`M8.11.1 opportunity-grade guard missing: ${token}`);
}
for (const token of ["monitoredSymbols", "swing10_trade_positions", "refreshCandidateRiskIntelligence(chipDb, monitoredSymbols"]) {
  if (!m8111Update.includes(token)) failures.push(`M8.11.1 held-position pipeline guard missing: ${token}`);
}
for (const token of ["refreshInstitutionalStealth(symbols", "readSmartSelection", "current_grade:opportunity.grade", "current_rank:top20Map.get(symbol)??null"]) {
  if (!m8111Trade.includes(token)) failures.push(`M8.11.1 position-continuity guard missing: ${token}`);
}
if (!m8111Foreign.includes("readForeignRadarSymbols")) failures.push("M8.11.1 fixed-universe foreign reader missing");
for (const token of ["今日相對最佳機會 Top5", "A1 確認", "A0 新機會", "A0待確認"]) {
  if (!m8111Page.includes(token)) failures.push(`M8.11.1 Swing10 UI guard missing: ${token}`);
}
if (failures.length) {
  console.error("\n❌ M8.11.1 Swing10 Opportunity Grade v2 guard failed:");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log("✅ M8.11.1 Swing10 Opportunity Grade v2 + Position Continuity guard passed.");
