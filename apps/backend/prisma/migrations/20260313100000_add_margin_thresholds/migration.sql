-- Add safe and critical margin ratio fields to portfolios
ALTER TABLE "portfolios" ADD COLUMN "safe_margin_ratio" DOUBLE PRECISION NOT NULL DEFAULT 0.15;
ALTER TABLE "portfolios" ADD COLUMN "critical_margin_ratio" DOUBLE PRECISION NOT NULL DEFAULT 0.10;
