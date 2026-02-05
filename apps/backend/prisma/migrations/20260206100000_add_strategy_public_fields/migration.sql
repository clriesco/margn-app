-- Make user_id nullable (platform strategies have no owner)
ALTER TABLE "saved_strategies" ALTER COLUMN "user_id" DROP NOT NULL;

-- Make metrics_json nullable (platform templates may not have backtest results)
ALTER TABLE "saved_strategies" ALTER COLUMN "metrics_json" DROP NOT NULL;

-- Make trajectories_json nullable (platform templates may not have backtest results)
ALTER TABLE "saved_strategies" ALTER COLUMN "trajectories_json" DROP NOT NULL;

-- Add visibility and type columns
ALTER TABLE "saved_strategies" ADD COLUMN "is_public" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "saved_strategies" ADD COLUMN "is_platform" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "saved_strategies" ADD COLUMN "description" TEXT;
ALTER TABLE "saved_strategies" ADD COLUMN "risk_profile_id" TEXT;

-- Add indexes for public strategy queries
CREATE INDEX "saved_strategies_is_public_is_platform_idx" ON "saved_strategies"("is_public", "is_platform");
CREATE INDEX "saved_strategies_risk_profile_id_idx" ON "saved_strategies"("risk_profile_id");
