-- AlterTable: Add earliest_known_date to assets
ALTER TABLE "assets" ADD COLUMN "earliest_known_date" DATE;

-- AlterTable: Add sharpe_weights_lookback_months to portfolios
ALTER TABLE "portfolios" ADD COLUMN "sharpe_weights_lookback_months" INTEGER NOT NULL DEFAULT 0;
