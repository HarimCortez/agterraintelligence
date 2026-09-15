import { Test } from "@nestjs/testing";
import { PrismaService } from "../common/prisma/prisma.service";
import { ErsCountyEconomicClient } from "./ers-county-economic-client";
import { ErsCountyEconomicIngestionService } from "./ers-county-economic-ingestion.service";

const FULL_RESULT = {
  populationYear: 2023,
  countyPopulation: 818330,
  countyNetMigration: 29364,
  countyRuralUrbanContinuumCode: 2,
  unemploymentYear: 2023,
  countyUnemploymentRatePct: 3.7,
  incomeYear: 2022,
  countyMedianHouseholdIncomeCents: 6194100,
};

describe("ErsCountyEconomicIngestionService", () => {
  let service: ErsCountyEconomicIngestionService;

  const prismaMock = {
    ingestionRun: { create: jest.fn(), update: jest.fn() },
    $queryRaw: jest.fn(),
    propertyCountyEconomicSummary: { findMany: jest.fn(), create: jest.fn() },
  };
  const economicClientMock = { fetchFloridaCountyResults: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ErsCountyEconomicIngestionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ErsCountyEconomicClient, useValue: economicClientMock },
      ],
    }).compile();
    service = moduleRef.get(ErsCountyEconomicIngestionService);

    prismaMock.ingestionRun.create.mockResolvedValue({ id: "run-1" });
    prismaMock.ingestionRun.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "run-1", itemsProcessed: 0, recordsCreated: 0, ...data }),
    );
    prismaMock.propertyCountyEconomicSummary.findMany.mockResolvedValue([]);
  });

  it("skips properties that already have this data, never fetching the ERS files for an all-skip run", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", county: "Polk" }]);
    prismaMock.propertyCountyEconomicSummary.findMany.mockResolvedValue([{ propertyId: "prop-1" }]);

    const result = await service.run();

    expect(economicClientMock.fetchFloridaCountyResults).not.toHaveBeenCalled();
    expect(prismaMock.propertyCountyEconomicSummary.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "succeeded", itemsProcessed: 1, recordsCreated: 0 });
  });

  it("fetches the county lookup exactly once and creates a row per property, matching county names case/whitespace-insensitively", async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      { id: "prop-1", county: "Polk" },
      { id: "prop-2", county: "DeSoto" },
    ]);
    economicClientMock.fetchFloridaCountyResults.mockResolvedValue(
      new Map([
        ["POLK", FULL_RESULT],
        ["DESOTO", { ...FULL_RESULT, countyPopulation: 35822, countyNetMigration: 412 }],
      ]),
    );

    const result = await service.run();

    expect(economicClientMock.fetchFloridaCountyResults).toHaveBeenCalledTimes(1);
    expect(prismaMock.propertyCountyEconomicSummary.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.propertyCountyEconomicSummary.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          propertyId: "prop-1",
          populationYear: 2023,
          countyPopulation: 818330,
          countyNetMigration: 29364,
          countyRuralUrbanContinuumCode: 2,
          unemploymentYear: 2023,
          countyUnemploymentRatePct: 3.7,
          incomeYear: 2022,
          countyMedianHouseholdIncomeCents: 6194100,
        }),
      }),
    );
    expect(result).toMatchObject({ status: "succeeded", itemsProcessed: 2, recordsCreated: 2 });
  });

  it("does not create a row when the property's county has no data in the lookup", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", county: "Monroe" }]);
    economicClientMock.fetchFloridaCountyResults.mockResolvedValue(new Map());

    const result = await service.run();

    expect(prismaMock.propertyCountyEconomicSummary.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "succeeded", recordsCreated: 0 });
  });

  it("still creates a row from a partial result (e.g. only population data available for that county)", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", county: "Polk" }]);
    economicClientMock.fetchFloridaCountyResults.mockResolvedValue(
      new Map([
        [
          "POLK",
          {
            populationYear: 2023,
            countyPopulation: 818330,
            countyNetMigration: null,
            countyRuralUrbanContinuumCode: null,
            unemploymentYear: 2023,
            countyUnemploymentRatePct: null,
            incomeYear: 2022,
            countyMedianHouseholdIncomeCents: null,
          },
        ],
      ]),
    );

    const result = await service.run();

    expect(prismaMock.propertyCountyEconomicSummary.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ countyPopulation: 818330, countyUnemploymentRatePct: null }),
      }),
    );
    expect(result).toMatchObject({ recordsCreated: 1 });
  });

  it("does not create a row when every tracked figure is null", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", county: "Polk" }]);
    economicClientMock.fetchFloridaCountyResults.mockResolvedValue(
      new Map([
        [
          "POLK",
          {
            populationYear: 2023,
            countyPopulation: null,
            countyNetMigration: null,
            countyRuralUrbanContinuumCode: null,
            unemploymentYear: 2023,
            countyUnemploymentRatePct: null,
            incomeYear: 2022,
            countyMedianHouseholdIncomeCents: null,
          },
        ],
      ]),
    );

    const result = await service.run();

    expect(prismaMock.propertyCountyEconomicSummary.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ recordsCreated: 0 });
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
