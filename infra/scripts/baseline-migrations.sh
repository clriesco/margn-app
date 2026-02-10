#!/bin/bash
# Baseline existing migrations for environments that used `prisma db push`.
# Run ONCE per environment (local, staging, production) before the first
# `prisma migrate deploy`. After that, the normal deploy pipeline works.
#
# Usage: cd apps/backend && bash ../../infra/scripts/baseline-migrations.sh

set -euo pipefail

MIGRATIONS=(
  20251126082307_add_daily_metrics
  20251230103524_add_portfolio_configuration
  20251230133601_add_contribution_frequency
  20251230151752_add_user_profile_fields
  20251230213125_remove_deployed_at
  20260203120000_add_avatar_url
  20260204160000_add_earliest_known_date
  20260204200000_add_saved_strategies
  20260205100000_add_risk_profile
  20260205150000_add_portfolio_target_assets
  20260206100000_add_strategy_public_fields
  20260206200000_add_contribution_type
  20260209130857_add_strategy_ai_analysis
  20260210120000_rename_notify_on_recommendations
  20260210174430_enable_rls_all_tables
)

echo "Baselining ${#MIGRATIONS[@]} existing migrations..."

for m in "${MIGRATIONS[@]}"; do
  echo "  Marking as applied: $m"
  npx prisma migrate resolve --applied "$m"
done

echo ""
echo "Baseline complete. Now run: npx prisma migrate deploy"
