-- M8.8.1 optional cleanup. Run only after confirming the new version is stable.
-- The application no longer reads these legacy tables. Keeping them is safe.
DROP TABLE IF EXISTS portfolio_ai_recommendations;
DROP TABLE IF EXISTS portfolio_snapshots;
DROP TABLE IF EXISTS algorithmic_validation_records;
DROP TABLE IF EXISTS market_validation_snapshots;
