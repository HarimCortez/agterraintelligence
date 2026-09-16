import { Test } from "@nestjs/testing";
import { PrismaService } from "../common/prisma/prisma.service";
import { ErsPovertyIncomeClient } from "./ers-poverty-income-client";
import { ErsPovertyIncomeIngestionService } from "./ers-poverty-income-ingestion.service";

describe("ErsPovertyIncomeIngestionService", () => {
  let service: ErsPovertyIncomeIngestionService;

  const prismaMock = {
    ingestionRun: { create: jest.fn(), update: jest.fn() },
    $queryRaw: jest.fn(),
    propertyCountyEconomicSummary: { update: jest.fn() },
  };
  const povertyIncomeClientMock = { fetchFloridaCountyResults: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ErsPovertyIncomeIngestionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ErsPovertyIncomeClient, useValue: povertyIncomeClientMock },
      ],
    }).compile();
    service = moduleRef.get(ErsPovertyIncomeIngestionService);

    prismaMock.ingestionRun.create.mockResolvedValue({ id: "run-1" });
    prismaMock.ingestionRun.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "run-1", itemsProcessed: 0, recordsCreated: 0, ...data }),
    );
  });

  it("only looks at summary rows not yet touched by this job", async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);

    await service.run();

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("updates the existing summary row with the real poverty/income figures", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ propertyId: "prop-1", county: "Hardee" }]);
    povertyIncomeClientMock.fetchFloridaCountyResults.mockResolvedValue(
      new Map([
        [
          "HARDEE",
          {
            countyPovertyRatePct: 26.2,
            countyChildPovertyRatePct: 40.7,
            countyDeepPovertyRatePct: 9.5,
            countyPerCapitaIncomeCents: 2237700,
          },
        ],
      ]),
    );

    const result = await service.run();

    expect(prismaMock.propertyCountyEconomicSummary.update).toHaveBeenCalledWith({
      where: { propertyId: "prop-1" },
      data: {
        povertyIncomeYear: 2021,
        countyPovertyRatePct: 26.2,
        countyChildPovertyRatePct: 40.7,
        countyDeepPovertyRatePct: 9.5,
        countyPerCapitaIncomeCents: 2237700,
      },
    });
    expect(result).toMatchObject({ status: "succeeded", itemsProcessed: 1, recordsCreated: 1 });
  });

  it("skips a property whose county has no real result", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ propertyId: "prop-1", county: "Unknown" }]);
    povertyIncomeClientMock.fetchFloridaCountyResults.mockResolvedValue(new Map());

    const result = await service.run();

    expect(prismaMock.propertyCountyEconomicSummary.update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "succeeded", recordsCreated: 0 });
  });

  it("does not call the client when no summary rows need updating", async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);

    await service.run();

    expect(povertyIncomeClientMock.fetchFloridaCountyResults).not.toHaveBeenCalled();
  });

  it("marks the run failed (not throwing) and records the error message when an unexpected error occurs", async () => {
    prismaMock.$queryRaw.mockRejectedValue(new Error("connection terminated"));

    const result = await service.run();

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toBe("connection terminated");
    expect(prismaMock.ingestionRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run-1" },
        data: expect.objectContaining({ status: "failed", errorMessage: "connection terminated" }),
      }),
    );
  });

  describe("trigger", () => {
    it("returns the new run id immediately, without waiting for the sweep to finish", async () => {
      let resolveQuery!: (rows: unknown[]) => void;
      prismaMock.$queryRaw.mockReturnValue(new Promise((resolve) => (resolveQuery = resolve)));

      const result = await service.trigger();

      expect(result).toEqual({ id: "run-1" });
      expect(prismaMock.ingestionRun.update).not.toHaveBeenCalled();

      resolveQuery([]);
      await new Promise((resolve) => setImmediate(resolve));
    });
  });
});
