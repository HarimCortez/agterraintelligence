import { Test } from "@nestjs/testing";
import { PrismaService } from "../common/prisma/prisma.service";
import { UsdaRdEligibilityClient } from "./usda-rd-eligibility-client";
import { UsdaRdEligibilityIngestionService } from "./usda-rd-eligibility-ingestion.service";

describe("UsdaRdEligibilityIngestionService", () => {
  let service: UsdaRdEligibilityIngestionService;

  const prismaMock = {
    ingestionRun: { create: jest.fn(), update: jest.fn() },
    $queryRaw: jest.fn(),
    propertyRiskFlag: { findMany: jest.fn(), create: jest.fn() },
  };
  const eligibilityClientMock = { queryPoint: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsdaRdEligibilityIngestionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: UsdaRdEligibilityClient, useValue: eligibilityClientMock },
      ],
    }).compile();
    service = moduleRef.get(UsdaRdEligibilityIngestionService);

    prismaMock.ingestionRun.create.mockResolvedValue({ id: "run-1" });
    prismaMock.ingestionRun.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "run-1", itemsProcessed: 0, recordsCreated: 0, ...data }),
    );
    prismaMock.propertyRiskFlag.findMany.mockResolvedValue([]);
  });

  it("skips a property that already holds flags for all three tracked programs, never querying it again", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", lat: 27.92, lng: -81.8 }]);
    prismaMock.propertyRiskFlag.findMany.mockResolvedValue([
      { propertyId: "prop-1", riskType: "rural_development_ineligible_housing" },
      { propertyId: "prop-1", riskType: "rural_development_ineligible_business" },
      { propertyId: "prop-1", riskType: "rural_development_ineligible_community_facilities" },
    ]);

    const result = await service.run();

    expect(eligibilityClientMock.queryPoint).not.toHaveBeenCalled();
    expect(prismaMock.propertyRiskFlag.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "succeeded", itemsProcessed: 1, recordsCreated: 0 });
  });

  it("creates one flag for a single-category real ineligibility hit (Bartow, housing only)", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", lat: 27.92, lng: -81.8 }]);
    eligibilityClientMock.queryPoint.mockResolvedValue(new Set(["housing"]));

    const result = await service.run();

    expect(prismaMock.propertyRiskFlag.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.propertyRiskFlag.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ propertyId: "prop-1", riskType: "rural_development_ineligible_housing", severity: "low" }),
      }),
    );
    expect(result).toMatchObject({ status: "succeeded", recordsCreated: 1 });
  });

  it("creates one flag per category when a point is ineligible for more than one program", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", lat: 27.92, lng: -81.8 }]);
    eligibilityClientMock.queryPoint.mockResolvedValue(new Set(["housing", "business"]));

    const result = await service.run();

    expect(prismaMock.propertyRiskFlag.create).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ recordsCreated: 2 });
  });

  it("does not create any flag for a fully eligible property (real result: empty set)", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", lat: 27.24, lng: -80.83 }]);
    eligibilityClientMock.queryPoint.mockResolvedValue(new Set());

    const result = await service.run();

    expect(prismaMock.propertyRiskFlag.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "succeeded", recordsCreated: 0 });
  });

  it("only creates flags for categories not already held, when a property has a partial set of existing flags", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", lat: 27.95, lng: -81.77 }]);
    prismaMock.propertyRiskFlag.findMany.mockResolvedValue([{ propertyId: "prop-1", riskType: "rural_development_ineligible_housing" }]);
    eligibilityClientMock.queryPoint.mockResolvedValue(new Set(["housing", "business"]));

    const result = await service.run();

    expect(prismaMock.propertyRiskFlag.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.propertyRiskFlag.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ riskType: "rural_development_ineligible_business" }) }),
    );
    expect(result).toMatchObject({ recordsCreated: 1 });
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
