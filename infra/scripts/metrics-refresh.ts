#!/usr/bin/env ts-node

/**
 * Daily metrics refresh job
 * Recalculates portfolio metrics (equity, exposure, leverage, etc.)
 */

import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

// Load .env from backend directory (only in development)
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.join(process.cwd(), "apps/backend/.env") });
}

const prisma = new PrismaClient();

/**
 * Calculate portfolio metrics for a given date
 */
async function calculateMetrics(portfolioId: string, date: Date) {
  // Get portfolio positions
  const positions = await prisma.portfolioPosition.findMany({
    where: { portfolioId },
    include: { asset: true },
  });

  if (positions.length === 0) {
    return null;
  }

  // Get latest prices for all assets
  const assetPrices = await Promise.all(
    positions.map(async (pos: (typeof positions)[0]) => {
      const latestPrice = await prisma.assetPrice.findFirst({
        where: {
          assetId: pos.assetId,
          date: { lte: date },
        },
        orderBy: { date: "desc" },
      });
      return {
        assetId: pos.assetId,
        price: latestPrice?.close || pos.avgPrice,
      };
    })
  );

  const priceMap = new Map(assetPrices.map((p) => [p.assetId, p.price]));

  // Calculate total exposure and update stored exposureUsd per position
  let totalExposure = 0;
  for (const pos of positions) {
    const currentPrice = priceMap.get(pos.assetId) || pos.avgPrice;
    const positionValue = pos.quantity * currentPrice;
    totalExposure += positionValue;

    // Keep exposureUsd in sync with current prices
    if (Math.abs(pos.exposureUsd - positionValue) > 0.01) {
      await prisma.portfolioPosition.update({
        where: {
          portfolioId_assetId: {
            portfolioId: pos.portfolioId,
            assetId: pos.assetId,
          },
        },
        data: { exposureUsd: positionValue },
      });
    }
  }

  // Get latest metrics to calculate base equity and borrowedAmount
  // Include metadataJson to check which contributions have already been processed
  const latestMetric = await prisma.metricsTimeseries.findFirst({
    where: { portfolioId },
    orderBy: { date: "desc" },
    select: {
      id: true,
      date: true,
      equity: true,
      exposure: true,
      borrowedAmount: true,
      createdAt: true,
      updatedAt: true,
      metadataJson: true,
    },
  });

  // Get all contributions for this portfolio up to today
  const dateEnd = new Date(date);
  dateEnd.setUTCHours(23, 59, 59, 999);

  const allContributions = await prisma.monthlyContribution.findMany({
    where: {
      portfolioId,
      contributedAt: {
        lte: dateEnd,
      },
    },
    orderBy: {
      contributedAt: "asc",
    },
  });

  // Determine which contributions are truly new (not yet reflected in equity)
  // Time-based deduplication: a contribution is "new" only if it was created
  // AFTER the latest metric was last written. This avoids the previous bug where
  // a limited lookback window (take: 5) caused old contributions to be "forgotten"
  // and re-added to equity every ~5 days.
  let newContributions: typeof allContributions = [];

  if (latestMetric) {
    // Only contributions created after the latest metric was written are truly new.
    // If the contribution service already wrote a metric that includes a contribution,
    // latestMetric.updatedAt will be >= contributedAt, so it won't be re-counted.
    newContributions = allContributions.filter(
      (c: (typeof allContributions)[0]) => c.contributedAt > latestMetric.updatedAt
    );
  } else if (allContributions.length > 0) {
    // No previous metrics — process all contributions
    newContributions = allContributions;
  }

  let contributionsSinceLastMetric = newContributions.reduce(
    (sum: number, c: any) => sum + (c.type === "withdrawal" ? -c.amount : c.amount),
    0
  );

  if (newContributions.length > 0) {
    console.log(
      `[metrics-refresh] Found ${
        newContributions.length
      } NEW contribution(s) totaling $${contributionsSinceLastMetric.toFixed(2)}`
    );
    newContributions.forEach((c: any) => {
      console.log(
        `  - $${c.amount.toFixed(2)} (id: ${
          c.id
        }, contributedAt: ${c.contributedAt.toISOString()})`
      );
    });
  } else {
    console.log(
      `[metrics-refresh] No new contributions (${allContributions.length} total, all before latest metric)`
    );
  }

  // Use contributions since last metric (more comprehensive)
  const totalContributionsToAdd = contributionsSinceLastMetric;

  // Calculate equity and borrowedAmount
  // IMPORTANT:
  // - Equity changes with price movements AND contributions
  // - borrowedAmount should remain constant unless there's a rebalance
  // - When there's a contribution, equity increases but borrowedAmount stays the same
  let equity: number;
  let borrowedAmount: number | null = null;

  const portfolio = await prisma.portfolio.findUnique({
    where: { id: portfolioId },
  });

  if (!portfolio) return null;

  if (
    latestMetric &&
    latestMetric.borrowedAmount !== null &&
    latestMetric.borrowedAmount >= 0 &&
    latestMetric.exposure > 0 &&
    totalExposure > 0
  ) {
    // Incremental equity: previous equity + exposure change + new contributions
    // This preserves contributions already absorbed into equity
    borrowedAmount = latestMetric.borrowedAmount;
    const exposureChange = totalExposure - latestMetric.exposure;
    equity = latestMetric.equity + exposureChange + totalContributionsToAdd;

    console.log(
      `[metrics-refresh] Incremental equity: $${latestMetric.equity.toFixed(
        2
      )} + exposure_change=$${exposureChange.toFixed(
        2
      )} + contributions=$${totalContributionsToAdd.toFixed(
        2
      )} = $${equity.toFixed(2)}`
    );
  } else if (
    latestMetric &&
    latestMetric.equity > 0 &&
    latestMetric.exposure > 0 &&
    totalExposure > 0
  ) {
    // Fallback: derive borrowedAmount from previous equity/exposure
    const previousBorrowed = latestMetric.exposure - latestMetric.equity;
    const targetLeverage =
      portfolio.leverageTarget ||
      (portfolio.leverageMin + portfolio.leverageMax) / 2;

    if (previousBorrowed >= 0) {
      borrowedAmount = previousBorrowed;
      const exposureChange = totalExposure - latestMetric.exposure;
      equity = latestMetric.equity + exposureChange + totalContributionsToAdd;

      console.log(
        `[metrics-refresh] Derived borrowedAmount=$${borrowedAmount.toFixed(
          2
        )}, incremental equity=$${equity.toFixed(2)}`
      );
    } else {
      // Corrupt data, recalculate from leverage target
      console.log(
        `[metrics-refresh] ⚠️  Corrupt data (negative borrowed=${previousBorrowed.toFixed(
          2
        )}). Recalculating from leverage target=${targetLeverage.toFixed(2)}`
      );
      equity = totalExposure / targetLeverage + totalContributionsToAdd;
      borrowedAmount = totalExposure - (equity - totalContributionsToAdd);
    }
  } else {
    // New portfolio or no previous metrics
    // For new portfolios, use initialCapital as base equity
    // Then calculate based on current exposure and leverage target
    const targetLeverage =
      portfolio.leverageTarget ||
      (portfolio.leverageMin + portfolio.leverageMax) / 2;

    if (totalExposure > 0) {
      // We have positions, calculate equity from exposure and leverage
      // equity = exposure / leverage
      equity = totalExposure / targetLeverage + totalContributionsToAdd;
      borrowedAmount = totalExposure - (equity - totalContributionsToAdd);
    } else {
      // No positions yet, use initialCapital as equity
      // This happens when portfolio is just created but positions haven't been set
      equity = (portfolio.initialCapital || 0) + totalContributionsToAdd;
      borrowedAmount = 0; // No borrowing if no exposure
    }

    console.log(
      `[metrics-refresh] New portfolio calculation: initialCapital=$${(
        portfolio.initialCapital || 0
      ).toFixed(2)}, exposure=$${totalExposure.toFixed(
        2
      )}, targetLeverage=${targetLeverage.toFixed(
        2
      )}, contributions_since_last_metric=$${totalContributionsToAdd.toFixed(
        2
      )}, final_equity=$${equity.toFixed(2)}`
    );
  }

  // Calculate current portfolio composition
  const composition = positions.map((pos: (typeof positions)[0]) => {
    const currentPrice = priceMap.get(pos.assetId) || pos.avgPrice;
    const value = pos.quantity * currentPrice;
    const weight = totalExposure > 0 ? value / totalExposure : 0;

    return {
      symbol: pos.asset.symbol,
      name: pos.asset.name,
      weight,
      value,
      quantity: pos.quantity,
    };
  });

  return {
    equity,
    exposure: totalExposure,
    leverage: equity > 0 ? totalExposure / equity : 0,
    borrowedAmount,
    sharpe: null, // Calculate later with returns history
    drawdown: null, // Calculate later with equity history
    composition, // Include composition in metrics
    newContributions, // Include new contributions to add to metadata
  };
}

/**
 * Main metrics refresh function
 */
async function refreshMetrics() {
  console.log("🔄 Starting metrics refresh...");

  try {
    const portfolios = await prisma.portfolio.findMany();

    if (portfolios.length === 0) {
      console.log("⚠️  No portfolios found. Skipping refresh.");
      return;
    }

    // Get today's date in UTC to avoid timezone issues
    // This ensures consistency with other services (positions.service.ts, rebalance.service.ts)
    const now = new Date();
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );

    let successCount = 0;
    let skipCount = 0;

    for (const portfolio of portfolios) {
      console.log(`Calculating metrics for portfolio ${portfolio.name}...`);

      const metrics = await calculateMetrics(portfolio.id, today);

      if (metrics) {
        // Check if there's an existing entry to preserve existing metadata
        const existingMetric = await prisma.metricsTimeseries.findFirst({
          where: {
            portfolioId: portfolio.id,
            date: today,
          },
        });

        // Build metadata with composition
        // IMPORTANT: Preserve arrays (contributions, rebalances, manualUpdates) from existing metadata
        const metadata: any = {
          source: "metrics-refresh",
          updatedAt: new Date().toISOString(),
        };

        // Always include current composition
        if (metrics.composition) {
          metadata.composition = metrics.composition;
        }

        // Preserve metadata and equity from same-day events (contribution, rebalance, manual update)
        // If another service already wrote today's metric, we preserve its equity adjusted for price changes
        let shouldPreserveEquity = false;
        let preservedEquity = 0;
        let preservedBorrowedAmount = 0;

        if (existingMetric && existingMetric.metadataJson) {
          try {
            const existingMetadata = JSON.parse(existingMetric.metadataJson);

            // Preserve all metadata arrays (contributions, rebalances, manualUpdates)
            const arrayKeys = ["contributions", "rebalances", "manualUpdates"] as const;
            for (const key of arrayKeys) {
              if (existingMetadata[key] && Array.isArray(existingMetadata[key])) {
                metadata[key] = existingMetadata[key];
              }
            }

            // Preserve source if it's not metrics-refresh
            if (
              existingMetadata.source &&
              existingMetadata.source !== "metrics-refresh"
            ) {
              metadata.source = existingMetadata.source;
            }

            // If today's metric was set by another service, preserve its equity
            // and only adjust for price changes since then
            const preservableSources = ["contribution", "rebalance", "manual_update"];
            if (preservableSources.includes(existingMetadata.source)) {
              const exposureChange = metrics.exposure - existingMetric.exposure;
              preservedEquity = existingMetric.equity + exposureChange;
              preservedBorrowedAmount = existingMetric.borrowedAmount || 0;
              shouldPreserveEquity = true;
              metadata.refreshedAt = new Date().toISOString();

              console.log(
                `[metrics-refresh] Preserving ${existingMetadata.source} equity: $${existingMetric.equity.toFixed(
                  2
                )} + price_change=$${exposureChange.toFixed(
                  2
                )} = $${preservedEquity.toFixed(2)}`
              );
            }
          } catch (e) {
            console.warn(
              `[metrics-refresh] Failed to parse existing metadata: ${e}`
            );
          }
        }

        // Add new contributions to the metadata.contributions array
        // This ensures they won't be counted again in future refreshes
        if (metrics.newContributions && metrics.newContributions.length > 0) {
          if (!metadata.contributions) {
            metadata.contributions = [];
          }
          for (const contrib of metrics.newContributions) {
            metadata.contributions.push({
              contributionId: contrib.id,
              amount: contrib.amount,
              note: contrib.note,
              contributedAt: contrib.contributedAt.toISOString(),
              processedAt: new Date().toISOString(),
            });
          }
          console.log(
            `[metrics-refresh] Added ${metrics.newContributions.length} contribution(s) to metadata`
          );
        }

        // Determine final values - preserve user's equity if they set it manually today
        const finalEquity = shouldPreserveEquity
          ? preservedEquity
          : metrics.equity;
        const finalBorrowedAmount = shouldPreserveEquity
          ? preservedBorrowedAmount
          : metrics.borrowedAmount;
        const finalLeverage =
          finalEquity > 0 ? metrics.exposure / finalEquity : 0;

        // Update monthly metrics (metrics_timeseries)
        await prisma.metricsTimeseries.upsert({
          where: {
            portfolioId_date: {
              portfolioId: portfolio.id,
              date: today,
            },
          },
          create: {
            portfolioId: portfolio.id,
            date: today,
            equity: finalEquity,
            exposure: metrics.exposure,
            leverage: finalLeverage,
            borrowedAmount: finalBorrowedAmount,
            sharpe: metrics.sharpe,
            drawdown: metrics.drawdown,
            metadataJson: JSON.stringify(metadata),
          },
          update: {
            // Only update exposure (prices changed), preserve equity if manually set
            equity: finalEquity,
            exposure: metrics.exposure,
            leverage: finalLeverage,
            borrowedAmount: finalBorrowedAmount,
            sharpe: metrics.sharpe,
            drawdown: metrics.drawdown,
            metadataJson: JSON.stringify(metadata),
          },
        });

        // Also update daily metrics (daily_metrics) for daily tracking
        const dailyMetricClient = prisma.dailyMetric;
        if (dailyMetricClient) {
          // Calculate peak equity from history
          const allMetrics = await prisma.metricsTimeseries.findMany({
            where: { portfolioId: portfolio.id },
            select: { equity: true },
          });

          let peakEquity = finalEquity;
          for (const m of allMetrics) {
            if (m.equity > peakEquity) {
              peakEquity = m.equity;
            }
          }

          // Calculate margin ratio using final equity
          const marginRatio =
            finalEquity > 0 ? finalEquity / metrics.exposure : 1;

          await dailyMetricClient.upsert({
            where: {
              portfolioId_date: {
                portfolioId: portfolio.id,
                date: today,
              },
            },
            create: {
              portfolioId: portfolio.id,
              date: today,
              equity: finalEquity,
              exposure: metrics.exposure,
              leverage: finalLeverage,
              peakEquity,
              marginRatio,
              borrowedAmount: finalBorrowedAmount,
            },
            update: {
              equity: finalEquity,
              exposure: metrics.exposure,
              leverage: finalLeverage,
              peakEquity,
              marginRatio,
              borrowedAmount: finalBorrowedAmount,
            },
          });
        }

        console.log(
          `✅ ${portfolio.name}: Equity=$${finalEquity.toFixed(
            2
          )}, Leverage=${finalLeverage.toFixed(2)}x${
            shouldPreserveEquity ? " (preserved from manual update)" : ""
          }`
        );
        successCount++;
      } else {
        console.log(`⚠️  ${portfolio.name}: No positions, skipping`);
        skipCount++;
      }
    }

    console.log("\n📊 Refresh Summary:");
    console.log(`   Success: ${successCount}`);
    console.log(`   Skipped: ${skipCount}`);
    console.log(`   Total: ${portfolios.length}`);
  } catch (error) {
    console.error("❌ Fatal error during metrics refresh:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly (CommonJS only)
if (typeof require !== "undefined" && require.main === module) {
  refreshMetrics()
    .then(() => {
      console.log("✅ Metrics refresh completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Metrics refresh failed:", error);
      process.exit(1);
    });
}

export { refreshMetrics };
