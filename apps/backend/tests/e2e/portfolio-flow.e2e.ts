/**
 * E2E Test: Complete Portfolio Flow
 *
 * This test validates the entire portfolio lifecycle:
 * 1. Creates a test user directly in DB (bypassing Clerk auth)
 * 2. Creates a portfolio with onboarding
 * 3. Tests contribution, rebalance, manual update, config change flows
 * 4. Runs daily scripts (price-ingestion, metrics-refresh, daily-check)
 * 5. Validates all portfolio metrics (equity, totalInvested, returns, CAGR)
 * 6. Cleans up: deletes the user and all related data
 *
 * Auth strategy: Creates a test user in the DB and generates a mock Clerk
 * session token. The backend AuthService is overridden to accept test tokens
 * when CLERK_TEST_MODE=true (set automatically by this test).
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as path from "path";
import { PrismaClient } from "@prisma/client";

const execAsync = promisify(exec);

// Configuration
const API_BASE_URL = process.env.API_URL || "http://localhost:3003/api";
const TEST_EMAIL = `e2e-test-${Date.now()}@test.local`;
const TEST_CLERK_ID = `test_clerk_${Date.now()}`;
const INITIAL_CAPITAL = 10000;

// Initialize Prisma
const prisma = new PrismaClient();

// Global test state
let bearerToken: string;
let testUserId: string;
let testPortfolioId: string;
let initialEquity: number;

// Track all FORMAL contributions made during the test (via /contributions API)
// Note: Manual equity updates are NOT contributions - they're adjustments
let totalFormalContributions = 0;

/**
 * Interface for portfolio summary response
 */
interface PortfolioSummary {
  portfolio: {
    id: string;
    name: string;
    leverageMin: number;
    leverageMax: number;
  };
  metrics: {
    equity: number;
    exposure: number;
    leverage: number;
    totalContributions: number;
    pendingContributions: number;
    absoluteReturn: number;
    percentReturn: number;
    startDate?: string;
    lastUpdate?: string;
  };
  positions: any[];
  analytics: {
    capitalFinal: number;
    totalInvested: number;
    absoluteReturn: number;
    totalReturnPercent: number;
    cagr: number;
    volatility: number;
    sharpe: number;
    maxDrawdownEquity: number;
    maxDrawdownExposure: number;
    underwaterDays: number;
    bestDay: { date: string; return: number } | null;
    worstDay: { date: string; return: number } | null;
  };
}

/**
 * Generate a test token. For E2E tests, the backend must be running with
 * CLERK_TEST_MODE=true which makes AuthService accept tokens prefixed
 * with "e2e-test-token:" and extract the clerkId from the token value.
 */
function generateTestToken(): string {
  return `e2e-test-token:${TEST_CLERK_ID}`;
}

/**
 * Make API request with authentication
 */
async function apiRequest(
  endpoint: string,
  options: { method?: string; body?: any } = {}
): Promise<any> {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${bearerToken}`,
  };

  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `API request failed: ${response.status} ${response.statusText}\n${errorText}`
    );
  }

  // Handle SSE responses (for portfolio creation)
  const contentType = response.headers.get("content-type");
  if (contentType?.includes("text/event-stream")) {
    const text = await response.text();
    const lines = text.split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.substring(6));
          if (data.type === "complete") return data.result;
          if (data.type === "error") throw new Error(data.message);
        } catch {
          // Continue searching
        }
      }
    }
    throw new Error("No complete event found in SSE response");
  }

  return response.json();
}

/**
 * Run a script and wait for completion
 */
async function runScript(scriptName: string): Promise<void> {
  const scriptPath = path.resolve(
    __dirname,
    "../../../../infra/scripts",
    scriptName
  );

  const { stdout, stderr } = await execAsync(`npx ts-node "${scriptPath}"`, {
    cwd: path.resolve(__dirname, "../../../../infra/scripts"),
    env: {
      ...process.env,
      NODE_PATH: path.resolve(__dirname, "../../../../node_modules"),
    },
  });

  if (stderr && !stderr.includes("ExperimentalWarning")) {
    console.error(`Script stderr: ${stderr}`);
  }
}

/**
 * Get full portfolio summary with all metrics
 */
async function getPortfolioSummary(): Promise<PortfolioSummary> {
  return await apiRequest(`/portfolios/${testPortfolioId}/summary`);
}

/**
 * Get portfolio equity
 */
async function getPortfolioEquity(): Promise<number> {
  const summary = await getPortfolioSummary();
  return summary.metrics?.equity || 0;
}

/**
 * Log metrics summary for debugging
 */
function logMetricsSummary(summary: PortfolioSummary, label: string): void {
  console.log(`\n📊 ${label}:`);
  console.log(`   Equity: $${summary.metrics.equity.toFixed(2)}`);
  console.log(`   Exposure: $${summary.metrics.exposure.toFixed(2)}`);
  console.log(`   Leverage: ${summary.metrics.leverage.toFixed(2)}x`);
  console.log(
    `   Total Contributions: $${summary.metrics.totalContributions.toFixed(2)}`
  );
  console.log(`   --- Analytics ---`);
  console.log(
    `   Capital Final: $${summary.analytics.capitalFinal.toFixed(2)}`
  );
  console.log(
    `   Total Invested: $${summary.analytics.totalInvested.toFixed(2)}`
  );
  console.log(
    `   Absolute Return: $${summary.analytics.absoluteReturn.toFixed(2)}`
  );
  console.log(
    `   Total Return %: ${summary.analytics.totalReturnPercent.toFixed(2)}%`
  );
  console.log(`   CAGR: ${(summary.analytics.cagr * 100).toFixed(2)}%`);
  console.log(
    `   Volatility: ${(summary.analytics.volatility * 100).toFixed(2)}%`
  );
  console.log(`   Sharpe: ${summary.analytics.sharpe.toFixed(2)}`);
  console.log(
    `   Max Drawdown: ${(summary.analytics.maxDrawdownEquity * 100).toFixed(
      2
    )}%`
  );
}

describe("E2E: Portfolio Flow", () => {
  // Setup: Create test user and portfolio
  beforeAll(async () => {
    console.log(`\n🧪 Setting up test with email: ${TEST_EMAIL}`);

    // Create test user directly in DB with clerkId
    const testUser = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        clerkId: TEST_CLERK_ID,
      },
    });
    testUserId = testUser.id;

    // Grant pro subscription so tier-gated endpoints work
    await prisma.subscription.create({
      data: {
        userId: testUserId,
        tier: "pro",
        status: "active",
      },
    });

    // Generate test token
    bearerToken = generateTestToken();

    // Verify the token works
    const me = await apiRequest("/auth/me");
    expect(me.id).toBe(testUserId);
    expect(me.email).toBe(TEST_EMAIL);

    // Create portfolio via onboarding
    const portfolio = await apiRequest("/portfolios", {
      method: "POST",
      body: {
        name: "E2E Test Portfolio",
        initialCapital: INITIAL_CAPITAL,
        assets: [
          { symbol: "SPY", name: "S&P 500 ETF", assetType: "etf" },
          { symbol: "BTC-USD", name: "Bitcoin", assetType: "crypto" },
        ],
        weightAllocationMethod: "equal",
        leverageTarget: 3.0,
        leverageMin: 2.5,
        leverageMax: 4.0,
        monthlyContribution: 1000,
      },
    });

    testPortfolioId =
      portfolio.portfolio?.id || portfolio.portfolioId || portfolio.id;
    expect(testPortfolioId).toBeDefined();

    // Create initial positions
    await apiRequest("/positions", {
      method: "POST",
      body: {
        portfolioId: testPortfolioId,
        positions: [
          { symbol: "SPY", quantity: 30, avgPrice: 500, source: "quantfury" },
          {
            symbol: "BTC-USD",
            quantity: 0.2,
            avgPrice: 50000,
            source: "quantfury",
          },
        ],
        equity: INITIAL_CAPITAL,
      },
    });

    initialEquity = await getPortfolioEquity();
    expect(initialEquity).toBe(INITIAL_CAPITAL);

    // Initialize tracking - initial capital counts as the first "contribution"
    totalFormalContributions = INITIAL_CAPITAL;

    console.log(
      `✅ Setup complete: user=${testUserId}, portfolio=${testPortfolioId}`
    );
  });

  // Teardown: Delete test user and all related data
  afterAll(async () => {
    console.log("\n🧹 Cleaning up test data...");

    try {
      await prisma.user.delete({
        where: { id: testUserId },
      });
      console.log("✅ Test user and all related data deleted");
    } catch (error: any) {
      console.error(`Failed to delete user: ${error.message}`);
    }

    await prisma.$disconnect();
  });

  describe("Initial State", () => {
    it("should have correct initial metrics", async () => {
      const summary = await getPortfolioSummary();
      logMetricsSummary(summary, "Initial State");

      // Validate initial state
      expect(summary.metrics.equity).toBe(INITIAL_CAPITAL);
      expect(summary.analytics.totalInvested).toBe(INITIAL_CAPITAL);
      expect(
        Math.abs(summary.analytics.capitalFinal - INITIAL_CAPITAL)
      ).toBeLessThan(1);

      // Initially, absoluteReturn should be ~0 (no gains yet)
      // Note: might have small variance due to price changes
      expect(Math.abs(summary.analytics.absoluteReturn)).toBeLessThan(100);
    });
  });

  describe("Contribution Flow", () => {
    it("should add contribution and update all metrics correctly", async () => {
      const contributionAmount = 1000;
      const equityBefore = await getPortfolioEquity();

      await apiRequest("/contributions", {
        method: "POST",
        body: {
          portfolioId: testPortfolioId,
          amount: contributionAmount,
          note: "E2E test contribution",
        },
      });

      // Update tracking - this is a formal contribution
      totalFormalContributions += contributionAmount;

      const summary = await getPortfolioSummary();
      logMetricsSummary(summary, "After Contribution");

      // Validate equity increased by contribution amount
      const equityChange = summary.metrics.equity - equityBefore;
      expect(Math.abs(equityChange - contributionAmount)).toBeLessThan(1);

      // Validate metrics consistency
      expect(
        Math.abs(summary.analytics.totalInvested - totalFormalContributions)
      ).toBeLessThan(1);
      expect(
        Math.abs(summary.analytics.capitalFinal - summary.metrics.equity)
      ).toBeLessThan(1);
    });
  });

  describe("Daily Scripts", () => {
    it("should preserve metrics consistency after running all daily scripts", async () => {
      const summaryBefore = await getPortfolioSummary();
      const equityBefore = summaryBefore.metrics.equity;

      await runScript("price-ingestion.ts");
      await runScript("metrics-refresh.ts");
      await runScript("daily-check.ts");

      const summaryAfter = await getPortfolioSummary();
      logMetricsSummary(summaryAfter, "After Daily Scripts");

      // Equity should be preserved (allow 5% for price changes)
      const deviationPercent =
        Math.abs((summaryAfter.metrics.equity - equityBefore) / equityBefore) *
        100;
      expect(deviationPercent).toBeLessThan(5);

      // Validate metrics consistency
      expect(
        Math.abs(
          summaryAfter.analytics.totalInvested - totalFormalContributions
        )
      ).toBeLessThan(1);
      expect(
        Math.abs(
          summaryAfter.analytics.capitalFinal - summaryAfter.metrics.equity
        )
      ).toBeLessThan(1);
    });
  });

  describe("Rebalance Flow", () => {
    it("should preserve metrics consistency after rebalance", async () => {
      // Get proposal
      const proposal = await apiRequest(
        `/portfolios/${testPortfolioId}/rebalance/simulation`
      );
      expect(proposal.positions).toBeDefined();

      const summaryBefore = await getPortfolioSummary();

      // Accept proposal
      await apiRequest(`/portfolios/${testPortfolioId}/rebalance/apply`, {
        method: "POST",
        body: proposal,
      });

      // Run metrics-refresh
      await runScript("metrics-refresh.ts");

      const summaryAfter = await getPortfolioSummary();
      logMetricsSummary(summaryAfter, "After Rebalance");

      // Equity should be preserved (allow 5% for price changes)
      const deviationPercent =
        Math.abs(
          (summaryAfter.metrics.equity - summaryBefore.metrics.equity) /
            summaryBefore.metrics.equity
        ) * 100;
      expect(deviationPercent).toBeLessThan(5);

      // Validate metrics consistency
      expect(
        Math.abs(
          summaryAfter.analytics.totalInvested - totalFormalContributions
        )
      ).toBeLessThan(1);
      expect(
        Math.abs(
          summaryAfter.analytics.capitalFinal - summaryAfter.metrics.equity
        )
      ).toBeLessThan(1);
    });
  });

  describe("Manual Update Flow", () => {
    it("should sync positions without creating implicit contributions", async () => {
      // Get current state
      const summaryBefore = await getPortfolioSummary();
      const positions = summaryBefore.positions || [];
      const equityBefore = summaryBefore.metrics.equity;

      // Manual equity increase - position sync, NOT a contribution
      const manualEquityIncrease = 2000;
      const newEquity = equityBefore + manualEquityIncrease;

      const updatedPositions = positions.map((pos: any) => ({
        symbol: pos.asset.symbol,
        quantity: pos.quantity * 1.1, // 10% increase in quantities
        avgPrice: pos.avgPrice,
        source: "quantfury",
      }));

      await apiRequest("/positions", {
        method: "POST",
        body: {
          portfolioId: testPortfolioId,
          positions: updatedPositions,
          equity: newEquity,
        },
      });

      // totalFormalContributions does NOT change (no implicit contribution)

      const summaryAfterUpdate = await getPortfolioSummary();

      // Equity should be updated
      expect(
        Math.abs(summaryAfterUpdate.metrics.equity - newEquity)
      ).toBeLessThan(1);

      // totalContributions should NOT change (no implicit contribution)
      expect(
        Math.abs(
          summaryAfterUpdate.metrics.totalContributions -
            totalFormalContributions
        )
      ).toBeLessThan(1);

      // Run metrics-refresh
      await runScript("metrics-refresh.ts");

      const summaryAfterScripts = await getPortfolioSummary();
      logMetricsSummary(summaryAfterScripts, "After Manual Update");

      // Equity should be preserved (allow 5% for price changes)
      const deviationPercent =
        Math.abs((summaryAfterScripts.metrics.equity - newEquity) / newEquity) *
        100;
      expect(deviationPercent).toBeLessThan(5);

      // totalInvested should NOT include the equity change
      expect(
        Math.abs(
          summaryAfterScripts.analytics.totalInvested - totalFormalContributions
        )
      ).toBeLessThan(1);

      // absoluteReturn reflects the equity correction as apparent return
      // This is correct: sync corrects data, not real money movement
      const expectedAbsoluteReturn =
        summaryAfterScripts.analytics.capitalFinal - totalFormalContributions;
      expect(
        Math.abs(
          summaryAfterScripts.analytics.absoluteReturn - expectedAbsoluteReturn
        )
      ).toBeLessThan(1);

      console.log(`\n   📌 Manual Update Logic Verified:`);
      console.log(
        `      - Equity increased: $${equityBefore.toFixed(
          2
        )} → $${summaryAfterScripts.metrics.equity.toFixed(2)}`
      );
      console.log(
        `      - Total Invested (unchanged): $${totalFormalContributions.toFixed(
          2
        )}`
      );
      console.log(
        `      - Absolute Return: $${summaryAfterScripts.analytics.absoluteReturn.toFixed(
          2
        )}`
      );
    });
  });

  describe("Manual Update Flow - Negative Delta", () => {
    it("should sync positions with lower equity without creating implicit withdrawals", async () => {
      // Get current state
      const summaryBefore = await getPortfolioSummary();
      const positions = summaryBefore.positions || [];
      const equityBefore = summaryBefore.metrics.equity;

      // Manual equity DECREASE - position sync correction, NOT a withdrawal
      const manualEquityDecrease = -1500;
      const newEquity = equityBefore + manualEquityDecrease;

      const updatedPositions = positions.map((pos: any) => ({
        symbol: pos.asset.symbol,
        quantity: pos.quantity * 0.9, // 10% decrease in quantities
        avgPrice: pos.avgPrice,
        source: "quantfury",
      }));

      await apiRequest("/positions", {
        method: "POST",
        body: {
          portfolioId: testPortfolioId,
          positions: updatedPositions,
          equity: newEquity,
        },
      });

      // totalFormalContributions does NOT change (no implicit withdrawal)

      const summaryAfterUpdate = await getPortfolioSummary();

      // Equity should be updated (decreased)
      expect(
        Math.abs(summaryAfterUpdate.metrics.equity - newEquity)
      ).toBeLessThan(1);

      // totalContributions should NOT change (no implicit withdrawal)
      expect(
        Math.abs(
          summaryAfterUpdate.metrics.totalContributions -
            totalFormalContributions
        )
      ).toBeLessThan(1);

      // Run metrics-refresh
      await runScript("metrics-refresh.ts");

      const summaryAfterScripts = await getPortfolioSummary();
      logMetricsSummary(summaryAfterScripts, "After Manual Update (Negative)");

      // totalInvested should NOT change
      expect(
        Math.abs(
          summaryAfterScripts.analytics.totalInvested - totalFormalContributions
        )
      ).toBeLessThan(1);

      console.log(`\n   📌 Negative Manual Update Logic Verified:`);
      console.log(
        `      - Equity decreased: $${equityBefore.toFixed(
          2
        )} → $${summaryAfterScripts.metrics.equity.toFixed(2)}`
      );
      console.log(
        `      - Total Invested (unchanged): $${totalFormalContributions.toFixed(
          2
        )}`
      );
      console.log(
        `      - Absolute Return: $${summaryAfterScripts.analytics.absoluteReturn.toFixed(
          2
        )}`
      );
    });
  });

  describe("Configuration Change Flow", () => {
    it("should not affect metrics when configuration changes", async () => {
      const summaryBefore = await getPortfolioSummary();

      // Get current config
      const config = await apiRequest(
        `/portfolios/${testPortfolioId}/configuration`
      );
      const originalTarget = config.leverageTarget;

      // Change leverage target
      const newTarget = originalTarget > 2.5 ? 2.5 : 3.5;
      await apiRequest(`/portfolios/${testPortfolioId}/configuration`, {
        method: "PUT",
        body: { leverageTarget: newTarget },
      });

      // Run metrics-refresh
      await runScript("metrics-refresh.ts");

      const summaryAfter = await getPortfolioSummary();
      logMetricsSummary(summaryAfter, "After Config Change");

      // Equity should be preserved
      const deviationPercent =
        Math.abs(
          (summaryAfter.metrics.equity - summaryBefore.metrics.equity) /
            summaryBefore.metrics.equity
        ) * 100;
      expect(deviationPercent).toBeLessThan(5);

      // Restore original config
      await apiRequest(`/portfolios/${testPortfolioId}/configuration`, {
        method: "PUT",
        body: { leverageTarget: originalTarget },
      });

      // totalInvested should remain unchanged (config change != contribution)
      expect(
        Math.abs(
          summaryAfter.analytics.totalInvested - totalFormalContributions
        )
      ).toBeLessThan(1);
    });
  });

  describe("Final Metrics Validation", () => {
    it("should have consistent final metrics", async () => {
      const finalSummary = await getPortfolioSummary();
      logMetricsSummary(finalSummary, "FINAL STATE");

      console.log(`\n📈 Test Summary:`);
      console.log(`   Initial Capital: $${INITIAL_CAPITAL.toFixed(2)}`);
      console.log(
        `   Formal Contributions: $${totalFormalContributions.toFixed(2)}`
      );
      console.log(
        `   Final Equity: $${finalSummary.metrics.equity.toFixed(2)}`
      );
      console.log(
        `   Total Return: ${finalSummary.analytics.totalReturnPercent.toFixed(
          2
        )}%`
      );

      // Validate totalInvested matches formal contributions
      expect(
        Math.abs(
          finalSummary.analytics.totalInvested - totalFormalContributions
        )
      ).toBeLessThan(1);

      // Validate capitalFinal matches equity
      expect(
        Math.abs(
          finalSummary.analytics.capitalFinal - finalSummary.metrics.equity
        )
      ).toBeLessThan(1);

      // Validate absoluteReturn = capitalFinal - totalInvested
      const expectedAbsoluteReturn =
        finalSummary.analytics.capitalFinal -
        finalSummary.analytics.totalInvested;
      expect(
        Math.abs(finalSummary.analytics.absoluteReturn - expectedAbsoluteReturn)
      ).toBeLessThan(1);

      // Validate totalReturnPercent = (absoluteReturn / totalInvested) * 100
      const expectedReturnPercent =
        totalFormalContributions > 0
          ? (expectedAbsoluteReturn / totalFormalContributions) * 100
          : 0;
      expect(
        Math.abs(
          finalSummary.analytics.totalReturnPercent - expectedReturnPercent
        )
      ).toBeLessThan(1);

      // Additional sanity checks
      expect(finalSummary.metrics.equity).toBeGreaterThan(0);
      expect(finalSummary.analytics.capitalFinal).toBeGreaterThan(0);
      expect(Number.isFinite(finalSummary.analytics.cagr)).toBe(true);
      expect(Number.isFinite(finalSummary.analytics.volatility)).toBe(true);
      expect(Number.isFinite(finalSummary.analytics.sharpe)).toBe(true);

      // Manual updates do NOT create implicit contributions, so absoluteReturn
      // includes both market movements and manual equity adjustments (+$2000, -$1500 = +$500 net)
      // plus any market price changes during test execution
      expect(Number.isFinite(finalSummary.analytics.absoluteReturn)).toBe(true);
      expect(Number.isFinite(finalSummary.analytics.totalReturnPercent)).toBe(true);

      console.log(`\n   ✅ All metrics are consistent!`);
      console.log(
        `   📌 Key: absoluteReturn is ~$${finalSummary.analytics.absoluteReturn.toFixed(
          2
        )} (includes manual sync adjustments + market moves)`
      );
    });
  });
});
