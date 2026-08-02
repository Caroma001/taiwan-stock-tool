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

export const tursoMigrations = [createTursoStocksMigration, createStockImportAuditMigration, createMarketPipelineMigration, createPortfolioTradeHistoryMigration, createMarketValidationMigration, createAlgorithmicValidationMigration, repairAlgorithmicSchemaMigration, createHotStockCandidatesMigration, createCloudDeploymentMigration, createCloudSchedulerHealthMigration, createProductionMonitoringMigration] as const;
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
