import { PrismaService } from "../../src/prisma/prisma.service";

describe("PrismaService idle disconnect", () => {
  let service: PrismaService;
  let disconnect: jest.SpyInstance;
  let use: jest.SpyInstance;
  let middleware: (params: any, next: (params: any) => Promise<any>) => Promise<any>;

  const minutes = (n: number) => n * 60_000;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    service = new PrismaService();
    jest.spyOn(service, "$connect").mockResolvedValue(undefined);
    disconnect = jest.spyOn(service, "$disconnect").mockResolvedValue(undefined);
    use = jest.spyOn(service, "$use").mockImplementation((mw: any) => {
      middleware = mw;
    });
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    delete process.env.PRISMA_IDLE_DISCONNECT_MINUTES;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("is disabled when PRISMA_IDLE_DISCONNECT_MINUTES is not set", async () => {
    await service.onModuleInit();
    jest.advanceTimersByTime(minutes(60));

    expect(use).not.toHaveBeenCalled();
    expect(disconnect).not.toHaveBeenCalled();
  });

  it("disconnects once after the idle period without queries", async () => {
    process.env.PRISMA_IDLE_DISCONNECT_MINUTES = "5";
    await service.onModuleInit();

    jest.advanceTimersByTime(minutes(4));
    expect(disconnect).not.toHaveBeenCalled();

    jest.advanceTimersByTime(minutes(2));
    expect(disconnect).toHaveBeenCalledTimes(1);

    // Already disconnected: no repeated calls while still idle
    jest.advanceTimersByTime(minutes(30));
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("restarts the idle period after a query reconnects", async () => {
    process.env.PRISMA_IDLE_DISCONNECT_MINUTES = "5";
    await service.onModuleInit();
    jest.advanceTimersByTime(minutes(6));
    expect(disconnect).toHaveBeenCalledTimes(1);

    await middleware({}, async () => "row");
    jest.advanceTimersByTime(minutes(4));
    expect(disconnect).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(minutes(2));
    expect(disconnect).toHaveBeenCalledTimes(2);
  });

  it("never disconnects while a query is in flight", async () => {
    process.env.PRISMA_IDLE_DISCONNECT_MINUTES = "5";
    await service.onModuleInit();

    let finish: (value: string) => void = () => undefined;
    const pending = middleware({}, () => new Promise((resolve) => (finish = resolve)));
    jest.advanceTimersByTime(minutes(20));
    expect(disconnect).not.toHaveBeenCalled();

    finish("row");
    await pending;
    jest.advanceTimersByTime(minutes(6));
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
