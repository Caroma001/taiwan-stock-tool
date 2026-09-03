import { createTursoStocksMigration } from "./0001_create_stocks";
import { createStockImportAuditMigration } from "./0002_stock_import_audit";
import { createMarketPipelineMigration } from "./0003_market_pipeline";
import { createPortfolioTradeHistoryMigration } from "./0004_portfolio_trade_history";
import { createMarketValidationMigration } from "./0005_market_validation";
import { createAlgorithmicValidationMigration } from "./0006_algorithmic_validation";
import { repairAlgorithmicSchemaMigration } from "./0007_schema_repair";
import { createHotStockCandidatesMigration } from "./0008_hot_stock_candidates";
import { createCloudDeploymentMigration } from "./0009_cloud_deployment";
import { createCloudSchedulerHealthMigration } from "./0010_cloud_scheduler_health";
import { createProductionMonitoringMigration } from "./0011_production_monitoring";
import { createDataCenterMigration } from "./0012_data_center";
import { createCapitalEfficiencyMigration } from "./0013_capital_efficiency";
import { createForeignAccumulationMigration } from "./0014_foreign_accumulation";
import { createForeignSmartAccumulationMigration } from "./0016_foreign_smart_accumulation";
import { createOwnershipStructureMigration } from "./0017_ownership_structure";
import { createChipDataSyncMigration } from "./0018_chip_data_sync";
import { createOwnershipValidationMigration } from "./0019_ownership_validation";
import { createWinner25AnalysisMigration } from "./0020_winner25_analysis";
import { createInstitutionalStealthMigration } from "./0021_institutional_stealth";
import { createWinner25LiveScoringMigration } from "./0022_winner25_live_scoring";
import { createStealthTop20TestPoolMigration } from "./0023_stealth_top20_test_pool";
import { createUnifiedDailyPipelineMigration } from "./0024_unified_daily_pipeline";
import { createUpdateDiagnosticsMigration } from "./0025_update_diagnostics";
import { marketUniverseFailureClassificationMigration } from "./0026_market_universe_failure_classification";
import { tursoEfficiencyMigration } from "./0027_turso_efficiency";
import { activeDevelopmentJobMigration } from "./0028_active_development_job";
import { jobSourceOfTruthMigration } from "./0029_job_source_of_truth";
import { bulkDailySnapshotMigration } from "./0030_bulk_daily_snapshot";
import { durableQueueHeartbeatMigration } from "./0031_durable_queue_heartbeat";
import { durableQueueRecoveryV2Migration } from "./0032_durable_queue_recovery_v2";
import { riskMarginIntelligenceMigration } from "./0033_risk_margin_intelligence";
import { swing10CloseReviewMigration } from "./0034_swing10_close_review";
import { swing10TradeExecutionMigration } from "./0035_swing10_trade_execution";
import { earlyWatchMigration } from "./0036_early_watch";
import { dailyIntegratedReportMigration } from "./0037_daily_integrated_report";
import { dailyTrainingExportMigration } from "./0038_daily_training_export";
import { m8122QualityBruceScoreMigration } from "./0040_m8122_quality_brucescore";

export const tursoMigrations = [createTursoStocksMigration, createStockImportAuditMigration, createMarketPipelineMigration, createPortfolioTradeHistoryMigration, createMarketValidationMigration, createAlgorithmicValidationMigration, repairAlgorithmicSchemaMigration, createHotStockCandidatesMigration, createCloudDeploymentMigration, createCloudSchedulerHealthMigration, createProductionMonitoringMigration, createDataCenterMigration, createCapitalEfficiencyMigration, createForeignAccumulationMigration, createForeignSmartAccumulationMigration, createOwnershipStructureMigration, createChipDataSyncMigration, createOwnershipValidationMigration, createWinner25AnalysisMigration, createInstitutionalStealthMigration, createWinner25LiveScoringMigration, createStealthTop20TestPoolMigration, createUnifiedDailyPipelineMigration, createUpdateDiagnosticsMigration, marketUniverseFailureClassificationMigration, tursoEfficiencyMigration, activeDevelopmentJobMigration, jobSourceOfTruthMigration, bulkDailySnapshotMigration, durableQueueHeartbeatMigration, durableQueueRecoveryV2Migration, riskMarginIntelligenceMigration, swing10CloseReviewMigration, swing10TradeExecutionMigration, earlyWatchMigration, dailyIntegratedReportMigration, dailyTrainingExportMigration, m8122QualityBruceScoreMigration] as const;
export * from "./0001_create_stocks";
export * from "./0002_stock_import_audit";

export * from "./0003_market_pipeline";

export * from "./0004_portfolio_trade_history";

export * from "./0005_market_validation";

export * from "./0006_algorithmic_validation";

export * from "./0007_schema_repair";

export * from "./0008_hot_stock_candidates";

export * from "./0009_cloud_deployment";

export * from "./0010_cloud_scheduler_health";

export * from "./0011_production_monitoring";


export * from "./0012_data_center";

export * from "./0013_capital_efficiency";

export * from "./0014_foreign_accumulation";


export * from "./0016_foreign_smart_accumulation";

export * from "./0017_ownership_structure";

export * from "./0018_chip_data_sync";

export * from "./0019_ownership_validation";

export * from "./0020_winner25_analysis";

export * from "./0021_institutional_stealth";

export * from "./0022_winner25_live_scoring";

export * from "./0023_stealth_top20_test_pool";

export * from "./0024_unified_daily_pipeline";

export * from "./0025_update_diagnostics";


export * from "./0026_market_universe_failure_classification";


export * from "./0027_turso_efficiency";

export * from "./0028_active_development_job";

export * from "./0029_job_source_of_truth";

export * from "./0030_bulk_daily_snapshot";

export * from "./0031_durable_queue_heartbeat";

export * from "./0032_durable_queue_recovery_v2";

export * from "./0033_risk_margin_intelligence";

export * from "./0034_swing10_close_review";

export * from "./0035_swing10_trade_execution";

export * from "./0036_early_watch";

export * from "./0037_daily_integrated_report";

export * from "./0038_daily_training_export";

export * from "./0040_m8122_quality_brucescore";
