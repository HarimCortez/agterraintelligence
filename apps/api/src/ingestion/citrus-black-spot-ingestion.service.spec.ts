import { Test } from "@nestjs/testing";
import { PrismaService } from "../common/prisma/prisma.service";
import { CitrusBlackSpotClient } from "./citrus-black-spot-client";
import { CitrusBlackSpotIngestionService } from "./citrus-black-spot-ingestion.service";

describe("CitrusBlackSpotIngestionService", () => {
  let service: CitrusBlackSpotIngestionService;

  const prismaMock = {
    ingestionRun: { create: jest.fn(), update: jest.fn() },
    $queryRaw: jest.fn(),
    propertyRiskFlag: { findMany: jest.fn(), create: jest.fn() },
  };
  const blackSpotClientMock = { queryPoint: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CitrusBlackSpotIngestionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CitrusBlackSpotClient, useValue: blackSpotClientMock },
      ],
    }).compile();
    service = moduleRef.get(CitrusBlackSpotIngestionService);

    prismaMock.ingestionRun.create.mockResolvedValue({ id: "run-1" });
    prismaMock.ingestionRun.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "run-1", itemsProcessed: 0, recordsCreated: 0, ...data }),
    );
    prismaMock.propertyRiskFlag.findMany.mockResolvedValue([]);
  });

  it("only looks at citrus properties, queried by point not by county", async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);

    await service.run();

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("skips properties that already have the flag, never querying the service for them", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", county: "DeSoto", lat: 27.19, lng: -81.9 }]);
    prismaMock.propertyRiskFlag.findMany.mockResolvedValue([{ propertyId: "prop-1" }]);

    const result = await service.run();

    expect(blackSpotClientMock.queryPoint).not.toHaveBeenCalled();
    expect(prismaMock.propertyRiskFlag.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "succeeded", itemsProcessed: 1, recordsCreated: 0 });
  });

  it("creates a medium-severity, distinctly-named flag for a citrus property inside a real quarantine polygon", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", county: "Polk", lat: 27.65, lng: -81.52 }]);
    blackSpotClientMock.queryPoint.mockResolvedValue({ status: "Active Federal Quarantine" });

    const result = await service.run();

    expect(blackSpotClientMock.queryPoint).toHaveBeenCalledWith(27.65, -81.52);
    expect(prismaMock.propertyRiskFlag.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          propertyId: "prop-1",
          riskType: "citrus_black_spot_quarantine",
          severity: "medium",
        }),
      }),
    );
    expect(result).toMatchObject({ status: "succeeded", itemsProcessed: 1, recordsCreated: 1 });
  });

  it("does not create a flag when the property's point falls outside every quarantine polygon", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", county: "DeSoto", lat: 27.19, lng: -81.9 }]);
    blackSpotClientMock.queryPoint.mockResolvedValue(null);

    const result = await service.run();

    expect(prismaMock.propertyRiskFlag.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "succeeded", recordsCreated: 0 });
  });

  it("queries every citrus property individually, even multiple in the same county (unlike the HLB job, this is not county-cacheable)", async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      { id: "prop-1", county: "Polk", lat: 27.65, lng: -81.52 },
      { id: "prop-2", county: "Polk", lat: 27.9, lng: -81.8 },
    ]);
    blackSpotClientMock.queryPoint.mockResolvedValue({ status: "Active Federal Quarantine" });

    const result = await service.run();

    expect(blackSpotClientMock.queryPoint).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ recordsCreated: 2 });
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
