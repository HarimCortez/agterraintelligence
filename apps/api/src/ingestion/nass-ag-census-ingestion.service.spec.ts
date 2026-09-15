import { Test } from "@nestjs/testing";
import { PrismaService } from "../common/prisma/prisma.service";
import { NassAgCensusClient } from "./nass-ag-census-client";
import { NassAgCensusIngestionService } from "./nass-ag-census-ingestion.service";

describe("NassAgCensusIngestionService", () => {
  let service: NassAgCensusIngestionService;

  const prismaMock = {
    ingestionRun: { create: jest.fn(), update: jest.fn() },
    $queryRaw: jest.fn(),
    propertyAgCensusSummary: { findMany: jest.fn(), create: jest.fn() },
  };
  const censusClientMock = { fetchFloridaCountyResults: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        NassAgCensusIngestionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: NassAgCensusClient, useValue: censusClientMock },
      ],
    }).compile();
    service = moduleRef.get(NassAgCensusIngestionService);

    prismaMock.ingestionRun.create.mockResolvedValue({ id: "run-1" });
    prismaMock.ingestionRun.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "run-1", itemsProcessed: 0, recordsCreated: 0, ...data }),
    );
    prismaMock.propertyAgCensusSummary.findMany.mockResolvedValue([]);
  });

  it("skips properties that already have this data, never downloading the bulk file for an all-skip run", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", county: "Polk" }]);
    prismaMock.propertyAgCensusSummary.findMany.mockResolvedValue([{ propertyId: "prop-1" }]);

    const result = await service.run();

    expect(censusClientMock.fetchFloridaCountyResults).not.toHaveBeenCalled();
    expect(prismaMock.propertyAgCensusSummary.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "succeeded", itemsProcessed: 1, recordsCreated: 0 });
  });

  it("fetches the county lookup exactly once and creates a row per property, matching county names case/whitespace-insensitively", async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      { id: "prop-1", county: "Polk" },
      { id: "prop-2", county: "DeSoto" },
    ]);
    censusClientMock.fetchFloridaCountyResults.mockResolvedValue(
      new Map([
        ["POLK", { countyCattleInventoryHead: 109225, countyAgLandValueCentsPerAcre: 714000, countyIrrigatedAcres: 77650 }],
        ["DESOTO", { countyCattleInventoryHead: 65480, countyAgLandValueCentsPerAcre: 653100, countyIrrigatedAcres: 58322 }],
      ]),
    );

    const result = await service.run();

    expect(censusClientMock.fetchFloridaCountyResults).toHaveBeenCalledTimes(1);
    expect(prismaMock.propertyAgCensusSummary.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.propertyAgCensusSummary.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          propertyId: "prop-1",
          year: 2022,
          countyCattleInventoryHead: 109225,
          countyAgLandValueCentsPerAcre: 714000,
          countyIrrigatedAcres: 77650,
        }),
      }),
    );
    expect(result).toMatchObject({ status: "succeeded", itemsProcessed: 2, recordsCreated: 2 });
  });

  it("does not create a row when the property's county has no data in the lookup", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", county: "Miami-Dade" }]);
    censusClientMock.fetchFloridaCountyResults.mockResolvedValue(new Map());

    const result = await service.run();

    expect(prismaMock.propertyAgCensusSummary.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "succeeded", recordsCreated: 0 });
  });

  it("does not create a row when all three tracked figures are null (NASS withheld all of them for that county)", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", county: "Polk" }]);
    censusClientMock.fetchFloridaCountyResults.mockResolvedValue(
      new Map([["POLK", { countyCattleInventoryHead: null, countyAgLandValueCentsPerAcre: null, countyIrrigatedAcres: null }]]),
    );

    const result = await service.run();

    expect(prismaMock.propertyAgCensusSummary.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "succeeded", recordsCreated: 0 });
  });

  it("creates a row when only one of the three figures is available", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", county: "Polk" }]);
    censusClientMock.fetchFloridaCountyResults.mockResolvedValue(
      new Map([["POLK", { countyCattleInventoryHead: null, countyAgLandValueCentsPerAcre: 714000, countyIrrigatedAcres: null }]]),
    );

    const result = await service.run();

    expect(prismaMock.propertyAgCensusSummary.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ countyCattleInventoryHead: null, countyAgLandValueCentsPerAcre: 714000, countyIrrigatedAcres: null }),
      }),
    );
    expect(result).toMatchObject({ recordsCreated: 1 });
  });

  it("marks the run failed (not throwing) and records the error message when the bulk fetch fails", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", county: "Polk" }]);
    censusClientMock.fetchFloridaCountyResults.mockRejectedValue(new Error("NASS Census bulk file request timed out"));

    const result = await service.run();

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toBe("NASS Census bulk file request timed out");
    expect(prismaMock.ingestionRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run-1" },
        data: expect.objectContaining({ status: "failed", errorMessage: "NASS Census bulk file request timed out" }),
      }),
    );
  });

  describe("trigger", () => {
    it("returns the new run id immediately, without waiting for the sweep to finish", async () => {
      let resolveQueryRaw!: (rows: unknown[]) => void;
      prismaMock.$queryRaw.mockReturnValue(new Promise((resolve) => (resolveQueryRaw = resolve)));

      const result = await service.trigger();

      expect(result).toEqual({ id: "run-1" });
      expect(prismaMock.ingestionRun.update).not.toHaveBeenCalled();

      resolveQueryRaw([]);
      await new Promise((resolve) => setImmediate(resolve));
    });
  });
});
