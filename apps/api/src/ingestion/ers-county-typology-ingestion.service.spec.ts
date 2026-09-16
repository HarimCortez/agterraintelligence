import { Test } from "@nestjs/testing";
import { PrismaService } from "../common/prisma/prisma.service";
import { ErsCountyTypologyClient } from "./ers-county-typology-client";
import { ErsCountyTypologyIngestionService } from "./ers-county-typology-ingestion.service";

describe("ErsCountyTypologyIngestionService", () => {
  let service: ErsCountyTypologyIngestionService;

  const prismaMock = {
    ingestionRun: { create: jest.fn(), update: jest.fn() },
    $queryRaw: jest.fn(),
    propertyCountyEconomicSummary: { update: jest.fn() },
  };
  const typologyClientMock = { fetchFloridaCountyResults: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ErsCountyTypologyIngestionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ErsCountyTypologyClient, useValue: typologyClientMock },
      ],
    }).compile();
    service = moduleRef.get(ErsCountyTypologyIngestionService);

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

  it("updates the existing summary row with the real classification flags", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ propertyId: "prop-1", county: "Highlands" }]);
    typologyClientMock.fetchFloridaCountyResults.mockResolvedValue(
      new Map([
        [
          "HIGHLANDS",
          {
            countyFarmingDependent: false,
            countyHighNaturalAmenities: true,
            countyRetirementDestination: true,
            countyPopulationLoss: false,
            countyLowEducation: false,
            countyLowEmployment: true,
          },
        ],
      ]),
    );

    const result = await service.run();

    expect(prismaMock.propertyCountyEconomicSummary.update).toHaveBeenCalledWith({
      where: { propertyId: "prop-1" },
      data: {
        countyFarmingDependent: false,
        countyHighNaturalAmenities: true,
        countyRetirementDestination: true,
        countyPopulationLoss: false,
        countyLowEducation: false,
        countyLowEmployment: true,
      },
    });
    expect(result).toMatchObject({ status: "succeeded", itemsProcessed: 1, recordsCreated: 1 });
  });

  it("skips a property whose county has no real classification result", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ propertyId: "prop-1", county: "Unknown" }]);
    typologyClientMock.fetchFloridaCountyResults.mockResolvedValue(new Map());

    const result = await service.run();

    expect(prismaMock.propertyCountyEconomicSummary.update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "succeeded", recordsCreated: 0 });
  });

  it("does not call the client when no summary rows need updating", async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);

    await service.run();

    expect(typologyClientMock.fetchFloridaCountyResults).not.toHaveBeenCalled();
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
