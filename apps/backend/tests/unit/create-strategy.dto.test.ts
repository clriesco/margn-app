import "reflect-metadata";

import { ValidationPipe } from "@nestjs/common";

import { CreateStrategyDto } from "../../src/strategies/dto/create-strategy.dto";

describe("CreateStrategyDto", () => {
  // Same options as main.ts: unknown properties are dropped silently, so a trajectory field
  // missing from the DTO would vanish before it reaches the database.
  const pipe = new ValidationPipe({ whitelist: true, transform: true });

  const scenario = {
    startDate: "2020-01-01", endDate: "2023-01-01", finalCapital: 50000,
    totalContributed: 18000, returnPercent: 0.4, cagr: 0.12, sharpe: 1.2,
    maxDrawdownEquity: -0.2, recoveryDays: 90, underwaterDays: 30, finalLeverage: 3,
  };
  const body = (point: Record<string, unknown>) => ({
    name: "Growth",
    config: {
      symbols: ["SPY"], initialCapital: 10000, monthlyContribution: 500,
      leverageMin: 2.5, leverageMax: 4, leverageTarget: 3, windowMonths: 36,
      weights: { SPY: 1 }, weightMode: "equal",
    },
    metrics: { p10: scenario, p50: scenario, p90: scenario, totalWindows: 12, marginCallCount: 0 },
    trajectories: { p10: { points: [point] }, p50: { points: [point] }, p90: { points: [point] } },
  });
  const transform = (value: unknown): Promise<CreateStrategyDto> =>
    pipe.transform(value, { type: "body", metatype: CreateStrategyDto });

  it("keeps the cumulative return of each trajectory point", async () => {
    const dto = await transform(body({ date: "2020-01-02", equity: 10100, cumulativeReturn: 0.01 }));

    expect(dto.trajectories.p50.points[0]).toEqual({
      date: "2020-01-02", equity: 10100, cumulativeReturn: 0.01,
    });
  });

  it("still accepts points without it", async () => {
    const dto = await transform(body({ date: "2020-01-02", equity: 10100 }));

    expect(dto.trajectories.p50.points[0].cumulativeReturn).toBeUndefined();
  });
});
