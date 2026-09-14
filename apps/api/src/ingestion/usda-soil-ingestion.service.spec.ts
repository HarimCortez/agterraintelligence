import { Test } from "@nestjs/testing";
import { PrismaService } from "../common/prisma/prisma.service";
import { UsdaSoilClient } from "./usda-soil-client";
import { UsdaSoilIngestionService } from "./usda-soil-ingestion.service";

const SOIL_RESULT = {
  mapUnitKey: "1416169",
  mapUnitSymbol: "19",
  mapUnitName: "Floridana, Placid, and Okeelanta soils, frequently flooded",
  drainageClass: "Very poorly drained",
  floodFrequency: "Frequent",
  slopePercent: 0.5,
  capabilityClass: "7",
  hydricPct: 97,
};

describe("UsdaSoilIngestionService", () => {
  let service: UsdaSoilIngestionService;

  const prismaMock = {
    ingestionRun: { create: jest.fn(), update: jest.fn() },
    $queryRaw: jest.fn(),
    propertySoilData: { findMany: jest.fn(), create: jest.fn() },
  };
  const usdaSoilClientMock = { querySoilAtPoint: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsdaSoilIngestionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: UsdaSoilClient, useValue: usdaSoilClientMock },
      ],
    }).compile();
    service = moduleRef.get(UsdaSoilIngestionService);

    prismaMock.ingestionRun.create.mockResolvedValue({ id: "run-1" });
    prismaMock.ingestionRun.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "run-1", itemsProcessed: 0, recordsCreated: 0, ...data }),
    );
    prismaMock.propertySoilData.findMany.mockResolvedValue([]);
  });

  it("skips properties that already have soil data, never querying USDA for them", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", lat: 27.22, lng: -80.78 }]);
    prismaMock.propertySoilData.findMany.mockResolvedValue([{ propertyId: "prop-1" }]);

    const result = await service.run();

    expect(usdaSoilClientMock.querySoilAtPoint).not.toHaveBeenCalled();
    expect(prismaMock.propertySoilData.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "succeeded", itemsProcessed: 1, recordsCreated: 0 });
  });

  it("creates a PropertySoilData row for each property with a real result", async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      { id: "prop-1", lat: 27.22, lng: -80.78 },
      { id: "prop-2", lat: 27.52, lng: -81.47 },
    ]);
    usdaSoilClientMock.querySoilAtPoint.mockResolvedValue(SOIL_RESULT);

    const result = await service.run();

    expect(prismaMock.propertySoilData.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.propertySoilData.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          propertyId: "prop-1",
          mapUnitName: "Floridana, Placid, and Okeelanta soils, frequently flooded",
          drainageClass: "Very poorly drained",
          hydricPct: 97,
        }),
      }),
    );
    expect(result).toMatchObject({ status: "succeeded", itemsProcessed: 2, recordsCreated: 2 });
  });

  it("does not create a row when USDA returns null (no mapped soil / request failure) for a point", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", lat: 0, lng: 0 }]);
    usdaSoilClientMock.querySoilAtPoint.mockResolvedValue(null);

    const result = await service.run();

    expect(prismaMock.propertySoilData.create).not.toHaveBeenCalled();
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
