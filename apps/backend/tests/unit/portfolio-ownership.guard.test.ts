import { ExecutionContext, ForbiddenException, NotFoundException, BadRequestException } from "@nestjs/common";

import { PortfolioOwnershipGuard } from "../../src/auth/portfolio-ownership.guard";

describe("PortfolioOwnershipGuard", () => {
  let guard: PortfolioOwnershipGuard;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      portfolio: {
        findUnique: jest.fn(),
      },
    };
    guard = new PortfolioOwnershipGuard(mockPrisma);
  });

  function createMockContext(overrides: {
    params?: Record<string, string>;
    body?: Record<string, string>;
    user?: { id: string };
  }): ExecutionContext {
    const request = {
      params: overrides.params || {},
      body: overrides.body || {},
      user: overrides.user || { id: "user-1" },
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  it("allows access when user owns the portfolio (params.portfolioId)", async () => {
    mockPrisma.portfolio.findUnique.mockResolvedValue({ userId: "user-1" });

    const ctx = createMockContext({
      params: { portfolioId: "port-1" },
      user: { id: "user-1" },
    });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(mockPrisma.portfolio.findUnique).toHaveBeenCalledWith({
      where: { id: "port-1" },
      select: { userId: true },
    });
  });

  it("allows access when portfolioId comes from params.id", async () => {
    mockPrisma.portfolio.findUnique.mockResolvedValue({ userId: "user-1" });

    const ctx = createMockContext({
      params: { id: "port-2" },
      user: { id: "user-1" },
    });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(mockPrisma.portfolio.findUnique).toHaveBeenCalledWith({
      where: { id: "port-2" },
      select: { userId: true },
    });
  });

  it("allows access when portfolioId comes from body", async () => {
    mockPrisma.portfolio.findUnique.mockResolvedValue({ userId: "user-1" });

    const ctx = createMockContext({
      body: { portfolioId: "port-3" },
      user: { id: "user-1" },
    });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it("throws ForbiddenException when user does not own portfolio", async () => {
    mockPrisma.portfolio.findUnique.mockResolvedValue({ userId: "other-user" });

    const ctx = createMockContext({
      params: { portfolioId: "port-1" },
      user: { id: "user-1" },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it("throws NotFoundException when portfolio does not exist", async () => {
    mockPrisma.portfolio.findUnique.mockResolvedValue(null);

    const ctx = createMockContext({
      params: { portfolioId: "nonexistent" },
      user: { id: "user-1" },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException);
  });

  it("throws BadRequestException when no portfolioId in request", async () => {
    const ctx = createMockContext({
      params: {},
      body: {},
      user: { id: "user-1" },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(BadRequestException);
  });
});
