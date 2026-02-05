-- CreateTable: Portfolio Target Assets
-- Separates "what the user wants to hold" from "what they actually hold"
CREATE TABLE "portfolio_target_assets" (
    "id" TEXT NOT NULL,
    "portfolio_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "target_weight" DOUBLE PRECISION NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portfolio_target_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "portfolio_target_assets_portfolio_id_idx" ON "portfolio_target_assets"("portfolio_id");

-- CreateIndex (unique constraint)
CREATE UNIQUE INDEX "portfolio_target_assets_portfolio_id_asset_id_key" ON "portfolio_target_assets"("portfolio_id", "asset_id");

-- AddForeignKey
ALTER TABLE "portfolio_target_assets" ADD CONSTRAINT "portfolio_target_assets_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_target_assets" ADD CONSTRAINT "portfolio_target_assets_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Migrate existing data: Create PortfolioTargetAsset entries from existing positions and targetWeightsJson
-- This ensures backwards compatibility

-- First, insert target assets based on existing PortfolioPositions
-- For each position, we'll try to get the weight from targetWeightsJson, defaulting to equal weights
INSERT INTO "portfolio_target_assets" ("id", "portfolio_id", "asset_id", "target_weight", "enabled", "created_at", "updated_at")
SELECT
    gen_random_uuid(),
    pp.portfolio_id,
    pp.asset_id,
    COALESCE(
        -- Try to extract weight from targetWeightsJson using the asset symbol
        (
            SELECT (p.target_weights_json::json->>a.symbol)::double precision
            FROM portfolios p
            WHERE p.id = pp.portfolio_id
            AND p.target_weights_json IS NOT NULL
        ),
        -- Fallback: equal weight based on number of positions
        1.0 / NULLIF((
            SELECT COUNT(*)
            FROM portfolio_positions pp2
            WHERE pp2.portfolio_id = pp.portfolio_id
        ), 0)
    ),
    true,
    NOW(),
    NOW()
FROM portfolio_positions pp
JOIN assets a ON a.id = pp.asset_id
ON CONFLICT (portfolio_id, asset_id) DO NOTHING;
