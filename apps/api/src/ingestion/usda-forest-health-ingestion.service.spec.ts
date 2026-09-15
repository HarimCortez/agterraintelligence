import { Test } from "@nestjs/testing";
import { PrismaService } from "../common/prisma/prisma.service";
import { UsdaForestHealthClient } from "./usda-forest-health-client";
import { UsdaForestHealthIngestionService } from "./usda-forest-health-ingestion.service";

const REAL_DETECTION = {
  causalAgent: "cypress looper",
  damageType: "Defoliation > 75% of leaves defoliated",
  host: "known but not listed",
  surveyYear: 2024,
};

describe("UsdaForestHealthIngestionService", () => {
  let service: UsdaForestHealthIngestionService;

  const prismaMock = {
    ingestionRun: { create: jest.fn(), update: jest.fn() },
    $queryRaw: jest.fn(),
    propertyRiskFlag: { findMany: jest.fn(), create: jest.fn() },
  };
  const forestHealthClientMock = { queryNearby: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsdaForestHealthIngestionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: UsdaForestHealthClient, useValue: forestHealthClientMock },
      ],
    }).compile();
    service = moduleRef.get(UsdaForestHealthIngestionService);

    prismaMock.ingestionRun.create.mockResolvedValue({ id: "run-1" });
    prismaMock.ingestionRun.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "run-1", itemsProcessed: 0, recordsCreated: 0, ...data }),
    );
    prismaMock.propertyRiskFlag.findMany.mockResolvedValue([]);
  });

  it("only sweeps timber properties (matches CitrusBlackSpotIngestionService's land-use scoping)", async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);

    await service.run();

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("skips properties that already have the flag, never re-querying them", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", county: "Highlands", lat: 27.43, lng: -81.38 }]);
    prismaMock.propertyRiskFlag.findMany.mockResolvedValue([{ propertyId: "prop-1" }]);

    const result = await service.run();

    expect(forestHealthClientMock.queryNearby).not.toHaveBeenCalled();
    expect(prismaMock.propertyRiskFlag.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "succeeded", itemsProcessed: 1, recordsCreated: 0 });
  });

  it("creates a flag summarizing a real detection when one is found nearby", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", county: "Okeechobee", lat: 27.285, lng: -80.92 }]);
    forestHealthClientMock.queryNearby.mockResolvedValue([REAL_DETECTION]);

    const result = await service.run();

    expect(prismaMock.propertyRiskFlag.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.propertyRiskFlag.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          propertyId: "prop-1",
          riskType: "forest_pest_disease_detection",
          severity: "low",
          description: expect.stringContaining("cypress looper"),
        }),
      }),
    );
    expect(result).toMatchObject({ status: "succeeded", recordsCreated: 1 });
  });

  it("does not create a flag when no detections are found nearby (real result for both this project's seeded timber properties)", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", county: "Highlands", lat: 27.43, lng: -81.38 }]);
    forestHealthClientMock.queryNearby.mockResolvedValue([]);

    const result = await service.run();

    expect(prismaMock.propertyRiskFlag.create).not.toHaveBeenCalled();
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
