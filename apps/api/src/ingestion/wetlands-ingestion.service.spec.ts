import { Test } from "@nestjs/testing";
import { PrismaService } from "../common/prisma/prisma.service";
import { WetlandsClient } from "./wetlands-client";
import { WetlandsIngestionService } from "./wetlands-ingestion.service";

describe("WetlandsIngestionService", () => {
  let service: WetlandsIngestionService;

  const prismaMock = {
    ingestionRun: { create: jest.fn(), update: jest.fn() },
    $queryRaw: jest.fn(),
    propertyRiskFlag: { findMany: jest.fn(), create: jest.fn() },
  };
  const wetlandsClientMock = { queryPoint: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        WetlandsIngestionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: WetlandsClient, useValue: wetlandsClientMock },
      ],
    }).compile();
    service = moduleRef.get(WetlandsIngestionService);

    prismaMock.ingestionRun.create.mockResolvedValue({ id: "run-1" });
    prismaMock.ingestionRun.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "run-1", itemsProcessed: 0, recordsCreated: 0, ...data }),
    );
  });

  it("skips properties that already have a wetlands flag, never querying the service for them", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", lat: 27.195, lng: -80.86 }]);
    prismaMock.propertyRiskFlag.findMany.mockResolvedValue([{ propertyId: "prop-1" }]);

    const result = await service.run();

    expect(wetlandsClientMock.queryPoint).not.toHaveBeenCalled();
    expect(prismaMock.propertyRiskFlag.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "succeeded", itemsProcessed: 1, recordsCreated: 0 });
  });

  it("creates a medium-severity wetlands flag only when the service reports a real intersection", async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      { id: "prop-1", lat: 27.195, lng: -80.86 },
      { id: "prop-2", lat: 27.285, lng: -80.92 },
    ]);
    prismaMock.propertyRiskFlag.findMany.mockResolvedValue([]);
    wetlandsClientMock.queryPoint.mockImplementation((lat: number) =>
      lat === 27.195
        ? Promise.resolve({ attribute: "PFO1Cd", wetlandType: "Freshwater Forested/Shrub Wetland" })
        : Promise.resolve(null),
    );

    const result = await service.run();

    expect(prismaMock.propertyRiskFlag.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.propertyRiskFlag.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ propertyId: "prop-1", riskType: "wetlands", severity: "medium" }),
      }),
    );
    expect(result).toMatchObject({ status: "succeeded", itemsProcessed: 2, recordsCreated: 1 });
  });

  it("does not create a flag when the service returns null (no wetland / request failure) for a point", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", lat: 0, lng: 0 }]);
    prismaMock.propertyRiskFlag.findMany.mockResolvedValue([]);
    wetlandsClientMock.queryPoint.mockResolvedValue(null);

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

    it("still finishes and updates the run to succeeded in the background after trigger() has already returned", async () => {
      prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", lat: 27.195, lng: -80.86 }]);
      prismaMock.propertyRiskFlag.findMany.mockResolvedValue([]);
      wetlandsClientMock.queryPoint.mockResolvedValue({ attribute: "PFO1Cd", wetlandType: "Freshwater Forested/Shrub Wetland" });

      await service.trigger();
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      expect(prismaMock.ingestionRun.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "run-1" }, data: expect.objectContaining({ status: "succeeded" }) }),
      );
    });
  });
});
