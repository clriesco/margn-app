#!/usr/bin/env ts-node

/**
 * Correction script for portfolio equity history.
 *
 * Fixes two bugs that corrupted equity/borrowedAmount in metrics_timeseries and daily_metrics:
 *
 * 1. **Contribution double-counting** — The metrics-refresh job used a 5-metric lookback
 *    window to deduplicate contributions. After 5 days, old contributions "fell out" of
 *    the window and were re-added to equity. Each re-processing inflated equity by the
 *    contribution amount. Rebalances then "baked in" the inflation by computing
 *    borrowed = exposure - inflated_equity.
 *
 * 2. **January "pinned at 3x" leverage** — An older version of metrics-refresh calculated
 *    equity = exposure / leverageTarget daily, effectively reborrowing to maintain exact
 *    target leverage. The correct behavior is to preserve borrowedAmount between events.
 *
 * Algorithm:
 *   - Exposure values in the DB are ALWAYS correct (computed from real positions x prices)
 *   - Recalculates equity and borrowedAmount forward from known clean anchors
 *   - Between rebalances: borrowed is preserved, equity floats with exposure changes
 *   - At rebalances: equity is unchanged, borrowed = new_exposure - equity
 *   - Contributions are counted exactly once
 *   - Positions set ABSOLUTELY from rebalance target_usd/price (not cumulative deltas)
 *     to avoid accumulation errors from phantom/failed rebalances
 *
 * Usage:
 *   npx ts-node infra/scripts/fix-equity-history.ts                    # Dry run (default)
 *   npx ts-node infra/scripts/fix-equity-history.ts --apply            # Apply corrections
 *   npx ts-node infra/scripts/fix-equity-history.ts --portfolio <id>   # Specific portfolio
 */

import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.join(process.cwd(), "apps/backend/.env") });
}

const prisma = new PrismaClient();

interface Rebalance {
  id: string;
  createdAt: Date;
  targetLeverage: number;
  totalTargetExposure: number;
}

interface RbAssetTarget {
  rebalanceId: string;
  symbol: string;
  targetUsd: number;
}

interface Correction {
  date: string;
  oldEquity: number;
  newEquity: number;
  oldBorrowed: number;
  newBorrowed: number;
  equityDiff: number;
  reason: string;
}

function dateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

function sameDay(a: Date, b: Date): boolean {
  return dateStr(a) === dateStr(b);
}

async function fixPortfolio(portfolioId: string, dryRun: boolean) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`Processing portfolio: ${portfolioId}`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : "APPLY"}`);
  console.log("=".repeat(70));

  // 1. Get portfolio config
  const portfolio = await prisma.portfolio.findUnique({
    where: { id: portfolioId },
  });
  if (!portfolio) {
    console.log("Portfolio not found!");
    return;
  }
  console.log(`Portfolio: ${portfolio.name}, initial capital: $${portfolio.initialCapital}`);

  // 2. Get all metrics ordered by date
  const metrics = await prisma.metricsTimeseries.findMany({
    where: { portfolioId },
    orderBy: { date: "asc" },
  });
  console.log(`Metrics entries: ${metrics.length}`);

  // 3. Get contributions
  const contributions = await prisma.monthlyContribution.findMany({
    where: { portfolioId },
    orderBy: { contributedAt: "asc" },
  });
  console.log(`Contributions: ${contributions.length}`);
  for (const c of contributions) {
    console.log(`  ${dateStr(c.contributedAt)}: $${c.amount.toFixed(2)} (${(c as any).type || "contribution"})`);
  }

  // 4. Get rebalance events with target_usd sums
  const rebalanceRows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT re.id, re.created_at, re.target_leverage,
      SUM(rp.target_usd) as total_target_exposure
    FROM rebalance_events re
    JOIN rebalance_positions rp ON rp.rebalance_event_id = re.id
    WHERE re.portfolio_id = $1
    GROUP BY re.id, re.created_at, re.target_leverage
    ORDER BY re.created_at
  `, portfolioId);

  const rebalances: Rebalance[] = rebalanceRows.map((r: any) => ({
    id: r.id,
    createdAt: new Date(r.created_at),
    targetLeverage: r.target_leverage,
    totalTargetExposure: parseFloat(r.total_target_exposure),
  }));
  console.log(`Rebalance events: ${rebalances.length}`);

  // 5. Get rebalance positions with target_usd per asset (for absolute position setting)
  const rbAssetRows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT re.id as rebalance_id, a.symbol, rp.target_usd
    FROM rebalance_events re
    JOIN rebalance_positions rp ON rp.rebalance_event_id = re.id
    JOIN assets a ON a.id = rp.asset_id
    WHERE re.portfolio_id = $1
    ORDER BY re.created_at, a.symbol
  `, portfolioId);

  const rbAssetTargets: RbAssetTarget[] = rbAssetRows.map((r: any) => ({
    rebalanceId: r.rebalance_id,
    symbol: r.symbol,
    targetUsd: parseFloat(r.target_usd),
  }));

  // 6. Get all asset prices
  const priceRows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT a.symbol, ap.date, ap.close
    FROM asset_prices ap
    JOIN assets a ON a.id = ap.asset_id
    WHERE a.symbol IN (
      SELECT DISTINCT a2.symbol FROM portfolio_positions pp
      JOIN assets a2 ON a2.id = pp.asset_id WHERE pp.portfolio_id = $1
      UNION
      SELECT DISTINCT a3.symbol FROM rebalance_positions rp
      JOIN rebalance_events re ON re.id = rp.rebalance_event_id
      JOIN assets a3 ON a3.id = rp.asset_id WHERE re.portfolio_id = $1
    )
    ORDER BY ap.date
  `, portfolioId);

  // Build price lookup: symbol -> date -> price
  const prices: Map<string, Map<string, number>> = new Map();
  for (const row of priceRows) {
    const symbol = row.symbol;
    const date = dateStr(new Date(row.date));
    if (!prices.has(symbol)) prices.set(symbol, new Map());
    prices.get(symbol)!.set(date, parseFloat(row.close));
  }

  // 7. Detect portfolio reset days (manual updates that zero exposure)
  const resetDates = new Set<string>();
  for (const m of metrics) {
    if (m.metadataJson) {
      try {
        const meta = JSON.parse(m.metadataJson);
        if (meta.manualUpdates && Array.isArray(meta.manualUpdates)) {
          for (const mu of meta.manualUpdates) {
            if (mu.exposure === 0) {
              resetDates.add(dateStr(m.date));
              console.log(`  Detected portfolio reset on ${dateStr(m.date)}`);
            }
          }
        }
      } catch (e) {
        // skip
      }
    }
  }

  // 8. Build position timeline and process corrections
  // Positions are stored as symbol -> quantity (absolute, not deltas)
  const positionState: Map<string, number> = new Map();
  const corrections: Correction[] = [];
  const countedContributions = new Set<string>();

  // Anchor: first metric
  const firstMetric = metrics[0];
  if (!firstMetric) {
    console.log("No metrics found!");
    return;
  }

  const creationDate = dateStr(firstMetric.date);

  // Contributions on creation day
  const creationContribs = contributions.filter(
    (c) => dateStr(c.contributedAt) === creationDate
  );
  const creationContribAmount = creationContribs.reduce(
    (sum, c) => sum + (c.type === "withdrawal" ? -c.amount : c.amount),
    0
  );
  creationContribs.forEach((c) => countedContributions.add(c.id));

  let correctEquity = portfolio.initialCapital + creationContribAmount;
  let correctBorrowed = firstMetric.exposure > 0 ? firstMetric.exposure - correctEquity : 0;

  // Apply first rebalance (if on creation day) — set positions absolutely
  const creationRebalances = rebalances.filter((r) => sameDay(r.createdAt, firstMetric.date));
  if (creationRebalances.length > 0) {
    const effectiveRb = findEffectiveRebalance(creationRebalances, firstMetric.exposure);
    setPositionsAbsolute(positionState, rbAssetTargets, effectiveRb.id, prices, creationDate);
    correctBorrowed = firstMetric.exposure - correctEquity;
  }

  console.log(`\nAnchor (${creationDate}): equity=$${correctEquity.toFixed(2)}, borrowed=$${correctBorrowed.toFixed(2)}, exposure=$${firstMetric.exposure.toFixed(2)}`);

  // Compare first metric
  if (Math.abs(correctEquity - firstMetric.equity) > 0.01 ||
      Math.abs(correctBorrowed - (firstMetric.borrowedAmount || 0)) > 1.0) {
    corrections.push({
      date: creationDate,
      oldEquity: firstMetric.equity,
      newEquity: correctEquity,
      oldBorrowed: firstMetric.borrowedAmount || 0,
      newBorrowed: correctBorrowed,
      equityDiff: correctEquity - firstMetric.equity,
      reason: "anchor correction",
    });
  }

  // 9. Process remaining days
  let prevExposure = firstMetric.exposure;
  let cashBuffer = 0;

  for (let i = 1; i < metrics.length; i++) {
    const m = metrics[i];
    const day = dateStr(m.date);

    // Check for portfolio reset on this day
    // A reset zeroes all positions and sets equity explicitly via manual_update.
    // We extract ALL manual_update entries to find:
    //   (a) the reset equity (from the zero-exposure update)
    //   (b) the equity at effective rebalance time (accounts for intra-day price movement)
    let resetInfo: { resetEquity: number; manualUpdates: any[] } | null = null;
    if (resetDates.has(day) && m.metadataJson) {
      try {
        const meta = JSON.parse(m.metadataJson);
        if (meta.manualUpdates && Array.isArray(meta.manualUpdates)) {
          let resetEquity: number | null = null;
          for (const mu of meta.manualUpdates) {
            if (mu.exposure === 0 && typeof mu.equity === "number") {
              resetEquity = mu.equity;
            }
          }
          if (resetEquity !== null) {
            resetInfo = { resetEquity, manualUpdates: meta.manualUpdates };
          }
        }
      } catch (e) {
        // skip
      }
    }

    if (resetInfo) {
      console.log(`\nReset anchor (${day}): equity explicitly set to $${resetInfo.resetEquity.toFixed(2)}`);
      correctEquity = resetInfo.resetEquity;
      correctBorrowed = 0;
      cashBuffer = 0;
      positionState.clear();
      countedContributions.clear();

      // Mark contributions that are equity adjustments (before the reset), not real cash
      const dayContribsForReset = contributions.filter((c) => dateStr(c.contributedAt) === day);
      const resetTimestamp = resetInfo.manualUpdates
        .filter((mu: any) => mu.exposure === 0)
        .map((mu: any) => new Date(mu.updatedAt))
        .sort((a: Date, b: Date) => b.getTime() - a.getTime())[0];
      if (resetTimestamp) {
        for (const c of dayContribsForReset) {
          if (c.contributedAt <= resetTimestamp) {
            countedContributions.add(c.id);
          }
        }
      }
    }

    // Find rebalances and contributions on this day
    const dayRebalances = rebalances.filter((r) => sameDay(r.createdAt, m.date));
    const dayContribs = contributions.filter(
      (c) => dateStr(c.contributedAt) === day && !countedContributions.has(c.id)
    );

    if (dayRebalances.length > 0) {
      // === REBALANCE DAY ===

      // 1. Find effective rebalance (the one that was actually applied)
      const effectiveRb = findEffectiveRebalance(dayRebalances, m.exposure);
      if (effectiveRb !== dayRebalances[dayRebalances.length - 1]) {
        console.log(`  [${day}] Using rebalance ${effectiveRb.createdAt.toISOString()} (target=$${effectiveRb.totalTargetExposure.toFixed(0)}) instead of last (target=$${dayRebalances[dayRebalances.length - 1].totalTargetExposure.toFixed(0)}) — matches metric exposure better`);
      }

      // 2. Compute pre-rebalance exposure using current positions x today's prices
      let preRbExposure = 0;
      for (const [symbol, qty] of Array.from(positionState.entries())) {
        const price = prices.get(symbol)?.get(day);
        if (price && qty > 0) {
          preRbExposure += qty * price;
        }
      }

      // 3. Price movement before rebalance (only if we have valid positions)
      const priceMovement = preRbExposure > 0 ? preRbExposure - prevExposure : 0;

      // 4. Split contributions into before/after the effective rebalance
      const contribsBefore = dayContribs.filter((c) => c.contributedAt <= effectiveRb.createdAt);
      const contribsAfter = dayContribs.filter((c) => c.contributedAt > effectiveRb.createdAt);
      const contribBeforeAmount = contribsBefore.reduce(
        (sum, c) => sum + (c.type === "withdrawal" ? -c.amount : c.amount), 0
      );
      const contribAfterAmount = contribsAfter.reduce(
        (sum, c) => sum + (c.type === "withdrawal" ? -c.amount : c.amount), 0
      );

      // 5. Equity at rebalance time
      // On reset days, positions were cleared so we can't compute pre-rebalance price movement.
      // Instead, use the manual_update equity closest to (and before) the effective rebalance,
      // which already accounts for intra-day price movement.
      let equityAtRebalance: number;
      if (resetInfo && priceMovement === 0) {
        // Find the manual_update with exposure > 0 closest to the effective rebalance time
        const rbTime = effectiveRb.createdAt.getTime();
        let bestMuEquity: number | null = null;
        let bestTimeDiff = Infinity;
        for (const mu of resetInfo.manualUpdates) {
          if (mu.exposure > 0 && typeof mu.equity === "number" && mu.updatedAt) {
            const muTime = new Date(mu.updatedAt).getTime();
            const diff = rbTime - muTime;
            // Must be before or at the rebalance, and closest
            if (diff >= 0 && diff < bestTimeDiff) {
              bestTimeDiff = diff;
              bestMuEquity = mu.equity;
            }
          }
        }
        if (bestMuEquity !== null) {
          equityAtRebalance = bestMuEquity + contribBeforeAmount;
          console.log(`  [${day}] Using manual_update equity $${bestMuEquity.toFixed(2)} at rebalance time (instead of reset equity $${correctEquity.toFixed(2)})`);
        } else {
          equityAtRebalance = correctEquity + contribBeforeAmount;
        }
      } else {
        equityAtRebalance = correctEquity + priceMovement + contribBeforeAmount;
      }

      // 6. SET POSITIONS ABSOLUTELY from effective rebalance's target_usd / price
      // This avoids all cumulative delta errors and phantom rebalance issues
      setPositionsAbsolute(positionState, rbAssetTargets, effectiveRb.id, prices, day);

      // 7. Borrowed = effective rebalance target exposure - equity (cash deployed)
      correctEquity = equityAtRebalance;
      const postRbExposure = effectiveRb.totalTargetExposure;
      correctBorrowed = postRbExposure - correctEquity;
      cashBuffer = 0;

      // 8. Add contributions after rebalance (undeployed cash)
      correctEquity += contribAfterAmount;
      cashBuffer = contribAfterAmount;

      // 9. Price movement from rebalance to end of day
      const postRbPriceMovement = m.exposure - postRbExposure;
      correctEquity += postRbPriceMovement;

      dayContribs.forEach((c) => countedContributions.add(c.id));

    } else {
      // === REGULAR DAY (no rebalance) ===
      const exposureChange = m.exposure - prevExposure;

      const contribAmount = dayContribs.reduce(
        (sum, c) => sum + (c.type === "withdrawal" ? -c.amount : c.amount), 0
      );
      dayContribs.forEach((c) => countedContributions.add(c.id));

      correctEquity += exposureChange + contribAmount;
      cashBuffer += contribAmount;
      // borrowed unchanged
    }

    // Update prevExposure for next iteration
    prevExposure = m.exposure;

    // Invariant check: equity + borrowed = exposure + cashBuffer
    const invariantGap = Math.abs((correctEquity + correctBorrowed) - (m.exposure + cashBuffer));
    if (invariantGap > 1.0) {
      console.warn(`  INVARIANT VIOLATION on ${day}: E($${correctEquity.toFixed(2)}) + B($${correctBorrowed.toFixed(2)}) = $${(correctEquity + correctBorrowed).toFixed(2)} != exp($${m.exposure.toFixed(2)}) + cash($${cashBuffer.toFixed(2)}) = $${(m.exposure + cashBuffer).toFixed(2)}, gap=$${invariantGap.toFixed(2)}`);
    }

    // Compare with stored values
    const equityDiff = correctEquity - m.equity;
    const borrowedDiff = correctBorrowed - (m.borrowedAmount || 0);

    if (Math.abs(equityDiff) > 1.0 || Math.abs(borrowedDiff) > 1.0) {
      let reason = "";
      if (dayRebalances.length > 0) reason = "rebalance day correction";
      else if (dayContribs.length > 0) reason = "contribution day correction";
      else reason = "equity/borrowed drift correction";

      corrections.push({
        date: day,
        oldEquity: m.equity,
        newEquity: correctEquity,
        oldBorrowed: m.borrowedAmount || 0,
        newBorrowed: correctBorrowed,
        equityDiff,
        reason,
      });
    }
  }

  // 10. Output results
  console.log(`\n${"─".repeat(70)}`);
  console.log(`CORRECTIONS NEEDED: ${corrections.length} of ${metrics.length} metrics`);
  console.log("─".repeat(70));

  if (corrections.length > 0) {
    console.log(
      `${"Date".padEnd(12)} ${"Old Equity".padStart(14)} ${"New Equity".padStart(14)} ${"Diff".padStart(10)} ${"Old Borrow".padStart(14)} ${"New Borrow".padStart(14)} Reason`
    );
    console.log("─".repeat(100));

    for (const c of corrections) {
      console.log(
        `${c.date.padEnd(12)} ${("$" + c.oldEquity.toFixed(2)).padStart(14)} ${("$" + c.newEquity.toFixed(2)).padStart(14)} ${((c.equityDiff >= 0 ? "+" : "") + "$" + c.equityDiff.toFixed(2)).padStart(10)} ${("$" + c.oldBorrowed.toFixed(2)).padStart(14)} ${("$" + c.newBorrowed.toFixed(2)).padStart(14)} ${c.reason}`
      );
    }

    const lastCorrection = corrections[corrections.length - 1];
    console.log(`\nCurrent equity overstatement: $${Math.abs(lastCorrection.equityDiff).toFixed(2)}`);
    console.log(`Current borrowed understatement: $${Math.abs(lastCorrection.newBorrowed - lastCorrection.oldBorrowed).toFixed(2)}`);
  }

  // 11. Apply corrections
  if (!dryRun && corrections.length > 0) {
    console.log(`\nApplying ${corrections.length} corrections...`);

    for (const c of corrections) {
      const date = new Date(c.date + "T00:00:00Z");
      const exposure = metrics.find(m => dateStr(m.date) === c.date)?.exposure || 0;
      const leverage = c.newEquity > 0 ? exposure / c.newEquity : 0;
      const marginRatio = exposure > 0 ? c.newEquity / exposure : 1;

      await prisma.metricsTimeseries.update({
        where: {
          portfolioId_date: { portfolioId, date },
        },
        data: {
          equity: c.newEquity,
          borrowedAmount: c.newBorrowed,
          leverage,
        },
      });

      const existingDaily = await prisma.dailyMetric.findUnique({
        where: {
          portfolioId_date: { portfolioId, date },
        },
      });
      if (existingDaily) {
        const allCorrected = corrections.filter(cr => cr.date <= c.date);
        const maxEquity = Math.max(
          c.newEquity,
          existingDaily.peakEquity || 0,
          ...allCorrected.map(cr => cr.newEquity)
        );

        await prisma.dailyMetric.update({
          where: {
            portfolioId_date: { portfolioId, date },
          },
          data: {
            equity: c.newEquity,
            borrowedAmount: c.newBorrowed,
            leverage,
            marginRatio,
            peakEquity: maxEquity,
          },
        });
      }
    }

    console.log("Corrections applied successfully.");
  } else if (corrections.length > 0) {
    console.log("\nDry run complete. Run with --apply to apply corrections.");
  } else {
    console.log("\nNo corrections needed.");
  }

  return corrections;
}

/**
 * Find the rebalance whose target best matches the metric's stored exposure.
 * Handles "phantom" rebalances (records exist but weren't applied to positions).
 */
function findEffectiveRebalance(dayRebalances: Rebalance[], metricExposure: number): Rebalance {
  let best = dayRebalances[0];
  let bestDiff = Math.abs(best.totalTargetExposure - metricExposure);
  for (const rb of dayRebalances) {
    const diff = Math.abs(rb.totalTargetExposure - metricExposure);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = rb;
    }
  }
  return best;
}

/**
 * Set positions absolutely from a rebalance's target_usd / price.
 * This avoids cumulative delta errors from phantom/failed rebalances.
 */
function setPositionsAbsolute(
  positionState: Map<string, number>,
  rbAssetTargets: RbAssetTarget[],
  rebalanceId: string,
  prices: Map<string, Map<string, number>>,
  day: string,
) {
  const targets = rbAssetTargets.filter(t => t.rebalanceId === rebalanceId);
  positionState.clear();
  for (const t of targets) {
    const price = prices.get(t.symbol)?.get(day);
    if (price && price > 0) {
      positionState.set(t.symbol, t.targetUsd / price);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes("--apply");
  const portfolioIdx = args.indexOf("--portfolio");
  const specificPortfolio = portfolioIdx >= 0 ? args[portfolioIdx + 1] : null;

  try {
    if (specificPortfolio) {
      await fixPortfolio(specificPortfolio, dryRun);
    } else {
      const portfolios = await prisma.portfolio.findMany();
      for (const p of portfolios) {
        await fixPortfolio(p.id, dryRun);
      }
    }
  } catch (error) {
    console.error("Error:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    console.log("\nDone.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Failed:", error);
    process.exit(1);
  });
