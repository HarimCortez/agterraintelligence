import { Test } from "@nestjs/testing";
import { PrismaService } from "../common/prisma/prisma.service";
import { SweetOrangeScabClient } from "./sweet-orange-scab-client";
import { SweetOrangeScabIngestionService } from "./sweet-orange-scab-ingestion.service";

describe("SweetOrangeScabIngestionService", () => {
  let service: SweetOrangeScabIngestionService;

  const prismaMock = {
    ingestionRun: { create: jest.fn(), update: jest.fn() },
    property: { findMany: jest.fn() },
    propertyRiskFlag: { findMany: jest.fn(), create: jest.fn() },
  };
  const scabClientMock = { queryCountyStatus: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        SweetOrangeScabIngestionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: SweetOrangeScabClient, useValue: scabClientMock },
      ],
    }).compile();
    service = moduleRef.get(SweetOrangeScabIngestionService);

    prismaMock.ingestionRun.create.mockResolvedValue({ id: "run-1" });
    prismaMock.ingestionRun.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "run-1", itemsProcessed: 0, recordsCreated: 0, ...data }),
    );
    prismaMock.propertyRiskFlag.findMany.mockResolvedValue([]);
  });

  it("only looks at citrus properties", async () => {
    prismaMock.property.findMany.mockResolvedValue([]);

    await service.run();

    expect(prismaMock.property.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { landUseType: "citrus" } }),
    );
  });

  it("skips properties that already have the flag, never querying the service for them", async () => {
    prismaMock.property.findMany.mockResolvedValue([{ id: "prop-1", county: "DeSoto" }]);
    prismaMock.propertyRiskFlag.findMany.mockResolvedValue([{ propertyId: "prop-1" }]);

    const result = await service.run();

    expect(scabClientMock.queryCountyStatus).not.toHaveBeenCalled();
    expect(prismaMock.propertyRiskFlag.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "succeeded", itemsProcessed: 1, recordsCreated: 0 });
  });

  it("creates a low-severity flag for a citrus property in a quarantined county (the real, current outcome for every FL seed county)", async () => {
    prismaMock.property.findMany.mockResolvedValue([{ id: "prop-1", county: "DeSoto" }]);
    scabClientMock.queryCountyStatus.mockResolvedValue({ status: "Active Federal Quarantine" });

    const result = await service.run();

    expect(prismaMock.propertyRiskFlag.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          propertyId: "prop-1",
          riskType: "sweet_orange_scab_quarantine",
          severity: "low",
          description: expect.stringContaining("Sweet Orange Scab"),
        }),
      }),
    );
    expect(result).toMatchObject({ status: "succeeded", itemsProcessed: 1, recordsCreated: 1 });
  });

  it("queries each distinct county only once, even with multiple properties in it", async () => {
    prismaMock.property.findMany.mockResolvedValue([
      { id: "prop-1", county: "DeSoto" },
      { id: "prop-2", county: "DeSoto" },
    ]);
    scabClientMock.queryCountyStatus.mockResolvedValue({ status: "Active Federal Quarantine" });

    const result = await service.run();

    expect(scabClientMock.queryCountyStatus).toHaveBeenCalledTimes(1);
    expect(scabClientMock.queryCountyStatus).toHaveBeenCalledWith("DeSoto");
    expect(prismaMock.propertyRiskFlag.create).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ recordsCreated: 2 });
  });

  it("does not create a flag when the county has no active quarantine on record", async () => {
    prismaMock.property.findMany.mockResolvedValue([{ id: "prop-1", county: "Nonexistent" }]);
    scabClientMock.queryCountyStatus.mockResolvedValue(null);

    const result = await service.run();

    expect(prismaMock.propertyRiskFlag.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "succeeded", recordsCreated: 0 });
  });

  it("marks the run failed (not throwing) and records the error message when an unexpected error occurs", async () => {
    prismaMock.property.findMany.mockRejectedValue(new Error("connection terminated"));

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
      let resolveFindMany!: (rows: unknown[]) => void;
      prismaMock.property.findMany.mockReturnValue(new Promise((resolve) => (resolveFindMany = resolve)));

      const result = await service.trigger();

      expect(result).toEqual({ id: "run-1" });
      expect(prismaMock.ingestionRun.update).not.toHaveBeenCalled();

      resolveFindMany([]);
      await new Promise((resolve) => setImmediate(resolve));
    });
  });
});
