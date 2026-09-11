import { Test } from "@nestjs/testing";
import { PrismaService } from "../common/prisma/prisma.service";
import { FemaFloodZoneClient } from "./fema-flood-zone-client";
import { FemaFloodZoneIngestionService } from "./fema-flood-zone-ingestion.service";

describe("FemaFloodZoneIngestionService", () => {
  let service: FemaFloodZoneIngestionService;

  const prismaMock = {
    ingestionRun: { create: jest.fn(), update: jest.fn() },
    $queryRaw: jest.fn(),
    propertyRiskFlag: { findMany: jest.fn(), create: jest.fn() },
  };
  const femaClientMock = { queryPoint: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        FemaFloodZoneIngestionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: FemaFloodZoneClient, useValue: femaClientMock },
      ],
    }).compile();
    service = moduleRef.get(FemaFloodZoneIngestionService);

    prismaMock.ingestionRun.create.mockResolvedValue({ id: "run-1" });
    prismaMock.ingestionRun.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "run-1", propertiesChecked: 0, flagsCreated: 0, ...data }),
    );
  });

  it("skips properties that already have a flood_zone flag, never querying FEMA for them", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", lat: 27.22, lng: -80.78 }]);
    prismaMock.propertyRiskFlag.findMany.mockResolvedValue([{ propertyId: "prop-1" }]);

    const result = await service.run();

    expect(femaClientMock.queryPoint).not.toHaveBeenCalled();
    expect(prismaMock.propertyRiskFlag.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "succeeded", propertiesChecked: 1, flagsCreated: 0 });
  });

  it("creates a flood_zone flag only when FEMA reports a Special Flood Hazard Area hit", async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      { id: "prop-1", lat: 27.22, lng: -80.78 },
      { id: "prop-2", lat: 27.92, lng: -81.8 },
    ]);
    prismaMock.propertyRiskFlag.findMany.mockResolvedValue([]);
    femaClientMock.queryPoint.mockImplementation((lat: number) =>
      lat === 27.22
        ? Promise.resolve({ zone: "AE", zoneSubType: null, isSpecialFloodHazardArea: true })
        : Promise.resolve({ zone: "X", zoneSubType: "AREA OF MINIMAL FLOOD HAZARD", isSpecialFloodHazardArea: false }),
    );

    const result = await service.run();

    expect(prismaMock.propertyRiskFlag.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.propertyRiskFlag.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ propertyId: "prop-1", riskType: "flood_zone", severity: "high" }),
      }),
    );
    expect(result).toMatchObject({ status: "succeeded", propertiesChecked: 2, flagsCreated: 1 });
  });

  it("does not create a flag when FEMA returns null (no feature / request failure) for a point", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", lat: 0, lng: 0 }]);
    prismaMock.propertyRiskFlag.findMany.mockResolvedValue([]);
    femaClientMock.queryPoint.mockResolvedValue(null);

    const result = await service.run();

    expect(prismaMock.propertyRiskFlag.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "succeeded", flagsCreated: 0 });
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
    it("returns the new run id immediately, without waiting for the FEMA sweep to finish", async () => {
      let resolveQueryRaw!: (rows: unknown[]) => void;
      prismaMock.$queryRaw.mockReturnValue(new Promise((resolve) => (resolveQueryRaw = resolve)));

      const result = await service.trigger();

      expect(result).toEqual({ id: "run-1" });
      expect(prismaMock.ingestionRun.update).not.toHaveBeenCalled();

      resolveQueryRaw([]);
      await new Promise((resolve) => setImmediate(resolve));
    });

    it("still finishes and updates the run to succeeded in the background after trigger() has already returned", async () => {
      prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", lat: 27.22, lng: -80.78 }]);
      prismaMock.propertyRiskFlag.findMany.mockResolvedValue([]);
      femaClientMock.queryPoint.mockResolvedValue({ zone: "AE", zoneSubType: null, isSpecialFloodHazardArea: true });

      await service.trigger();
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      expect(prismaMock.ingestionRun.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "run-1" }, data: expect.objectContaining({ status: "succeeded" }) }),
      );
    });
  });
});
