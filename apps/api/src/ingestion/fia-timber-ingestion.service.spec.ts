import { Test } from "@nestjs/testing";
import { PrismaService } from "../common/prisma/prisma.service";
import { FiaTimberClient } from "./fia-timber-client";
import { FiaTimberIngestionService } from "./fia-timber-ingestion.service";

describe("FiaTimberIngestionService", () => {
  let service: FiaTimberIngestionService;

  const prismaMock = {
    ingestionRun: { create: jest.fn(), update: jest.fn() },
    $queryRaw: jest.fn(),
    propertyTimberSummary: { findMany: jest.fn(), create: jest.fn() },
  };
  const timberClientMock = { fetchFloridaCountyResults: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        FiaTimberIngestionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: FiaTimberClient, useValue: timberClientMock },
      ],
    }).compile();
    service = moduleRef.get(FiaTimberIngestionService);

    prismaMock.ingestionRun.create.mockResolvedValue({ id: "run-1" });
    prismaMock.ingestionRun.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "run-1", itemsProcessed: 0, recordsCreated: 0, ...data }),
    );
    prismaMock.propertyTimberSummary.findMany.mockResolvedValue([]);
  });

  it("only looks at timber properties", async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);

    await service.run();

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("skips properties that already have this data, never fetching the FIA lookup for an all-skip run", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", county: "Hardee" }]);
    prismaMock.propertyTimberSummary.findMany.mockResolvedValue([{ propertyId: "prop-1" }]);

    const result = await service.run();

    expect(timberClientMock.fetchFloridaCountyResults).not.toHaveBeenCalled();
    expect(prismaMock.propertyTimberSummary.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "succeeded", itemsProcessed: 1, recordsCreated: 0 });
  });

  it("fetches the county lookup exactly once and creates a row per property, matching county names case/whitespace-insensitively", async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      { id: "prop-1", county: "Hardee" },
      { id: "prop-2", county: "Highlands" },
    ]);
    timberClientMock.fetchFloridaCountyResults.mockResolvedValue(
      new Map([
        ["HARDEE", { countyTimberlandAcres: 105170, countyTimberVolumeCuFtPerAcre: 2485, countyTimberVolumeSamplingErrorPct: 28.3 }],
        ["HIGHLANDS", { countyTimberlandAcres: 96833, countyTimberVolumeCuFtPerAcre: 1425, countyTimberVolumeSamplingErrorPct: 36.7 }],
      ]),
    );

    const result = await service.run();

    expect(timberClientMock.fetchFloridaCountyResults).toHaveBeenCalledTimes(1);
    expect(prismaMock.propertyTimberSummary.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.propertyTimberSummary.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          propertyId: "prop-1",
          year: 2022,
          countyTimberlandAcres: 105170,
          countyTimberVolumeCuFtPerAcre: 2485,
          countyTimberVolumeSamplingErrorPct: 28.3,
        }),
      }),
    );
    expect(result).toMatchObject({ status: "succeeded", itemsProcessed: 2, recordsCreated: 2 });
  });

  it("does not create a row when the property's county has no data in the lookup", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", county: "Monroe" }]);
    timberClientMock.fetchFloridaCountyResults.mockResolvedValue(new Map());

    const result = await service.run();

    expect(prismaMock.propertyTimberSummary.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "succeeded", recordsCreated: 0 });
  });

  it("does not create a row when both tracked figures are null", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", county: "Hardee" }]);
    timberClientMock.fetchFloridaCountyResults.mockResolvedValue(
      new Map([["HARDEE", { countyTimberlandAcres: null, countyTimberVolumeCuFtPerAcre: null, countyTimberVolumeSamplingErrorPct: null }]]),
    );

    const result = await service.run();

    expect(prismaMock.propertyTimberSummary.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "succeeded", recordsCreated: 0 });
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
