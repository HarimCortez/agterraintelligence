import { Test } from "@nestjs/testing";
import { PrismaService } from "../common/prisma/prisma.service";
import { HpaiDairyCattleClient } from "./hpai-dairy-cattle-client";
import { HpaiDairyCattleIngestionService } from "./hpai-dairy-cattle-ingestion.service";

describe("HpaiDairyCattleIngestionService", () => {
  let service: HpaiDairyCattleIngestionService;

  const prismaMock = {
    ingestionRun: { create: jest.fn(), update: jest.fn() },
    property: { findMany: jest.fn() },
    propertyRiskFlag: { findMany: jest.fn(), create: jest.fn() },
  };
  const hpaiClientMock = { queryStateStatus: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        HpaiDairyCattleIngestionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: HpaiDairyCattleClient, useValue: hpaiClientMock },
      ],
    }).compile();
    service = moduleRef.get(HpaiDairyCattleIngestionService);

    prismaMock.ingestionRun.create.mockResolvedValue({ id: "run-1" });
    prismaMock.ingestionRun.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "run-1", itemsProcessed: 0, recordsCreated: 0, ...data }),
    );
    prismaMock.propertyRiskFlag.findMany.mockResolvedValue([]);
  });

  it("only looks at pasture properties", async () => {
    prismaMock.property.findMany.mockResolvedValue([]);

    await service.run();

    expect(prismaMock.property.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { landUseType: "pasture" } }),
    );
  });

  it("skips properties that already have the flag, never querying the service for them", async () => {
    prismaMock.property.findMany.mockResolvedValue([{ id: "prop-1", state: "FL" }]);
    prismaMock.propertyRiskFlag.findMany.mockResolvedValue([{ propertyId: "prop-1" }]);

    const result = await service.run();

    expect(hpaiClientMock.queryStateStatus).not.toHaveBeenCalled();
    expect(prismaMock.propertyRiskFlag.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "succeeded", itemsProcessed: 1, recordsCreated: 0 });
  });

  it("creates a medium-severity flag for a pasture property in a state with confirmed HPAI events", async () => {
    prismaMock.property.findMany.mockResolvedValue([{ id: "prop-1", state: "MI" }]);
    hpaiClientMock.queryStateStatus.mockResolvedValue({ totalConfirmedEvents: 8 });

    const result = await service.run();

    expect(prismaMock.propertyRiskFlag.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          propertyId: "prop-1",
          riskType: "hpai_dairy_cattle_confirmed_in_state",
          severity: "medium",
          description: expect.stringContaining("8"),
        }),
      }),
    );
    expect(result).toMatchObject({ status: "succeeded", itemsProcessed: 1, recordsCreated: 1 });
  });

  it("queries each distinct state only once, even with multiple properties in it", async () => {
    prismaMock.property.findMany.mockResolvedValue([
      { id: "prop-1", state: "MI" },
      { id: "prop-2", state: "MI" },
    ]);
    hpaiClientMock.queryStateStatus.mockResolvedValue({ totalConfirmedEvents: 8 });

    const result = await service.run();

    expect(hpaiClientMock.queryStateStatus).toHaveBeenCalledTimes(1);
    expect(hpaiClientMock.queryStateStatus).toHaveBeenCalledWith("MI");
    expect(prismaMock.propertyRiskFlag.create).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ recordsCreated: 2 });
  });

  it("does not create a flag when the state has no confirmed events on record (the real, current outcome for Florida)", async () => {
    prismaMock.property.findMany.mockResolvedValue([{ id: "prop-1", state: "FL" }]);
    hpaiClientMock.queryStateStatus.mockResolvedValue(null);

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
