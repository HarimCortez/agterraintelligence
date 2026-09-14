import { Test } from "@nestjs/testing";
import { PrismaService } from "../common/prisma/prisma.service";
import { RmaCauseOfLossClient } from "./rma-cause-of-loss-client";
import { RmaCauseOfLossIngestionService } from "./rma-cause-of-loss-ingestion.service";

describe("RmaCauseOfLossIngestionService", () => {
  let service: RmaCauseOfLossIngestionService;

  const prismaMock = {
    ingestionRun: { create: jest.fn(), update: jest.fn() },
    $queryRaw: jest.fn(),
    propertyCropLossSummary: { findMany: jest.fn(), create: jest.fn() },
  };
  const causeOfLossClientMock = { fetchFloridaCountyResults: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        RmaCauseOfLossIngestionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: RmaCauseOfLossClient, useValue: causeOfLossClientMock },
      ],
    }).compile();
    service = moduleRef.get(RmaCauseOfLossIngestionService);

    prismaMock.ingestionRun.create.mockResolvedValue({ id: "run-1" });
    prismaMock.ingestionRun.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "run-1", itemsProcessed: 0, recordsCreated: 0, ...data }),
    );
    prismaMock.propertyCropLossSummary.findMany.mockResolvedValue([]);
  });

  it("skips properties that already have this data, never fetching the RMA bulk file for an all-skip run", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", county: "Polk" }]);
    prismaMock.propertyCropLossSummary.findMany.mockResolvedValue([{ propertyId: "prop-1" }]);

    const result = await service.run();

    expect(causeOfLossClientMock.fetchFloridaCountyResults).not.toHaveBeenCalled();
    expect(prismaMock.propertyCropLossSummary.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "succeeded", itemsProcessed: 1, recordsCreated: 0 });
  });

  it("fetches the county lookup exactly once and creates a row per property, matching county names case/whitespace-insensitively", async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      { id: "prop-1", county: "Highlands" },
      { id: "prop-2", county: "DeSoto" },
    ]);
    causeOfLossClientMock.fetchFloridaCountyResults.mockResolvedValue(
      new Map([
        ["HIGHLANDS", { countyTopCauseOfLoss: "Freeze", countyTopCauseOfLossIndemnityCents: 868920000, countyTotalIndemnityCents: 1871281400 }],
        ["DESOTO", { countyTopCauseOfLoss: "Wind/Excess Wind", countyTopCauseOfLossIndemnityCents: 425545400, countyTotalIndemnityCents: 2433085900 }],
      ]),
    );

    const result = await service.run();

    expect(causeOfLossClientMock.fetchFloridaCountyResults).toHaveBeenCalledTimes(1);
    expect(prismaMock.propertyCropLossSummary.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.propertyCropLossSummary.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          propertyId: "prop-1",
          year: 2024,
          countyTopCauseOfLoss: "Freeze",
          countyTopCauseOfLossIndemnityCents: 868920000,
          countyTotalIndemnityCents: 1871281400,
        }),
      }),
    );
    expect(result).toMatchObject({ status: "succeeded", itemsProcessed: 2, recordsCreated: 2 });
  });

  it("does not create a row when the property's county has no data in the lookup", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", county: "Monroe" }]);
    causeOfLossClientMock.fetchFloridaCountyResults.mockResolvedValue(new Map());

    const result = await service.run();

    expect(prismaMock.propertyCropLossSummary.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "succeeded", recordsCreated: 0 });
  });

  it("still creates a row when the top cause is null (e.g. every claim in that county was the excluded ARPI bucket), as long as the total is present", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", county: "Polk" }]);
    causeOfLossClientMock.fetchFloridaCountyResults.mockResolvedValue(
      new Map([["POLK", { countyTopCauseOfLoss: null, countyTopCauseOfLossIndemnityCents: null, countyTotalIndemnityCents: 500000000 }]]),
    );

    const result = await service.run();

    expect(prismaMock.propertyCropLossSummary.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ countyTopCauseOfLoss: null, countyTotalIndemnityCents: 500000000 }),
      }),
    );
    expect(result).toMatchObject({ recordsCreated: 1 });
  });

  it("does not create a row when the county total itself is null", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", county: "Polk" }]);
    causeOfLossClientMock.fetchFloridaCountyResults.mockResolvedValue(
      new Map([["POLK", { countyTopCauseOfLoss: null, countyTopCauseOfLossIndemnityCents: null, countyTotalIndemnityCents: null }]]),
    );

    const result = await service.run();

    expect(prismaMock.propertyCropLossSummary.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ recordsCreated: 0 });
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
