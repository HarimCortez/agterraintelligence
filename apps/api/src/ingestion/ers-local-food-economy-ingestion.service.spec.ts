import { Test } from "@nestjs/testing";
import { PrismaService } from "../common/prisma/prisma.service";
import { ErsLocalFoodEconomyClient } from "./ers-local-food-economy-client";
import { ErsLocalFoodEconomyIngestionService } from "./ers-local-food-economy-ingestion.service";

describe("ErsLocalFoodEconomyIngestionService", () => {
  let service: ErsLocalFoodEconomyIngestionService;

  const prismaMock = {
    ingestionRun: { create: jest.fn(), update: jest.fn() },
    $queryRaw: jest.fn(),
    propertyAgCensusSummary: { update: jest.fn() },
  };
  const localFoodEconomyClientMock = { fetchFloridaCountyResults: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ErsLocalFoodEconomyIngestionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ErsLocalFoodEconomyClient, useValue: localFoodEconomyClientMock },
      ],
    }).compile();
    service = moduleRef.get(ErsLocalFoodEconomyIngestionService);

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

  it("updates the existing ag census summary row with the real local food economy figures", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ propertyId: "prop-1", county: "Polk" }]);
    localFoodEconomyClientMock.fetchFloridaCountyResults.mockResolvedValue(
      new Map([
        [
          "POLK",
          {
            countyOrchardAcres: 75302,
            countyBerryAcres: 1677,
            countyDirectFarmSalesPct: 33.454028,
            countyAgritourismOperations: 15,
            countyAgritourismReceiptsCents: 12800000,
          },
        ],
      ]),
    );

    const result = await service.run();

    expect(prismaMock.propertyAgCensusSummary.update).toHaveBeenCalledWith({
      where: { propertyId: "prop-1" },
      data: {
        localFoodEconomyYear: 2017,
        countyOrchardAcres: 75302,
        countyBerryAcres: 1677,
        countyDirectFarmSalesPct: 33.454028,
        countyAgritourismOperations: 15,
        countyAgritourismReceiptsCents: 12800000,
      },
    });
    expect(result).toMatchObject({ status: "succeeded", itemsProcessed: 1, recordsCreated: 1 });
  });

  it("skips a property whose county has no real result", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ propertyId: "prop-1", county: "Unknown" }]);
    localFoodEconomyClientMock.fetchFloridaCountyResults.mockResolvedValue(new Map());

    const result = await service.run();

    expect(prismaMock.propertyAgCensusSummary.update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "succeeded", recordsCreated: 0 });
  });

  it("does not call the client when no summary rows need updating", async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);

    await service.run();

    expect(localFoodEconomyClientMock.fetchFloridaCountyResults).not.toHaveBeenCalled();
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
