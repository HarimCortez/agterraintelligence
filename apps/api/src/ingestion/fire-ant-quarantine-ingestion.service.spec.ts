import { Test } from "@nestjs/testing";
import { PrismaService } from "../common/prisma/prisma.service";
import { FireAntQuarantineClient } from "./fire-ant-quarantine-client";
import { FireAntQuarantineIngestionService } from "./fire-ant-quarantine-ingestion.service";

describe("FireAntQuarantineIngestionService", () => {
  let service: FireAntQuarantineIngestionService;

  const prismaMock = {
    ingestionRun: { create: jest.fn(), update: jest.fn() },
    property: { findMany: jest.fn() },
    propertyRiskFlag: { findMany: jest.fn(), create: jest.fn() },
  };
  const quarantineClientMock = { queryCountyStatus: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        FireAntQuarantineIngestionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: FireAntQuarantineClient, useValue: quarantineClientMock },
      ],
    }).compile();
    service = moduleRef.get(FireAntQuarantineIngestionService);

    prismaMock.ingestionRun.create.mockResolvedValue({ id: "run-1" });
    prismaMock.ingestionRun.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "run-1", itemsProcessed: 0, recordsCreated: 0, ...data }),
    );
    prismaMock.propertyRiskFlag.findMany.mockResolvedValue([]);
  });

  it("sweeps all properties, not scoped to one land use type (unlike CitrusQuarantineIngestionService)", async () => {
    prismaMock.property.findMany.mockResolvedValue([]);

    await service.run();

    expect(prismaMock.property.findMany).toHaveBeenCalledWith({ select: { id: true, county: true } });
  });

  it("skips properties that already have the flag, never querying the service for them", async () => {
    prismaMock.property.findMany.mockResolvedValue([{ id: "prop-1", county: "Polk" }]);
    prismaMock.propertyRiskFlag.findMany.mockResolvedValue([{ propertyId: "prop-1" }]);

    const result = await service.run();

    expect(quarantineClientMock.queryCountyStatus).not.toHaveBeenCalled();
    expect(prismaMock.propertyRiskFlag.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "succeeded", itemsProcessed: 1, recordsCreated: 0 });
  });

  it("creates a low-severity flag for a property in a quarantined county", async () => {
    prismaMock.property.findMany.mockResolvedValue([{ id: "prop-1", county: "Polk" }]);
    quarantineClientMock.queryCountyStatus.mockResolvedValue({ status: "Active Federal Quarantine" });

    const result = await service.run();

    expect(prismaMock.propertyRiskFlag.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          propertyId: "prop-1",
          riskType: "imported_fire_ant_quarantine",
          severity: "low",
        }),
      }),
    );
    expect(result).toMatchObject({ status: "succeeded", itemsProcessed: 1, recordsCreated: 1 });
  });

  it("queries each distinct county only once, even with multiple properties in it", async () => {
    prismaMock.property.findMany.mockResolvedValue([
      { id: "prop-1", county: "Polk" },
      { id: "prop-2", county: "Polk" },
      { id: "prop-3", county: "Polk" },
    ]);
    quarantineClientMock.queryCountyStatus.mockResolvedValue({ status: "Active Federal Quarantine" });

    const result = await service.run();

    expect(quarantineClientMock.queryCountyStatus).toHaveBeenCalledTimes(1);
    expect(quarantineClientMock.queryCountyStatus).toHaveBeenCalledWith("Polk");
    expect(prismaMock.propertyRiskFlag.create).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ recordsCreated: 3 });
  });

  it("does not create a flag when the county has no active quarantine record", async () => {
    prismaMock.property.findMany.mockResolvedValue([{ id: "prop-1", county: "Some Nonquarantined County" }]);
    quarantineClientMock.queryCountyStatus.mockResolvedValue(null);

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
