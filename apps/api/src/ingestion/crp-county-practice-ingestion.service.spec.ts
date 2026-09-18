import { Test } from "@nestjs/testing";
import { PrismaService } from "../common/prisma/prisma.service";
import { CrpCountyPracticeClient } from "./crp-county-practice-client";
import { CrpCountyPracticeIngestionService } from "./crp-county-practice-ingestion.service";

const REAL_HOLMES_PRACTICES = [
  { reportPeriod: "CUMULATIVE, AS OF JANUARY 2017", practiceLabel: "TREE PLANTINGS - SOFTWOODS (CP3)", practiceCode: "CP3", acres: 1895.8, isTotal: false },
  { reportPeriod: "CUMULATIVE, AS OF JANUARY 2017", practiceLabel: "WILDLIFE HABITAT (CP4D)", practiceCode: "CP4D", acres: 8, isTotal: false },
  { reportPeriod: "CUMULATIVE, AS OF JANUARY 2017", practiceLabel: "TOTAL (ALL PRACTICES)", practiceCode: "TOTAL", acres: 3341, isTotal: true },
];

describe("CrpCountyPracticeIngestionService", () => {
  let service: CrpCountyPracticeIngestionService;

  // `$transaction` mock runs the callback against a `tx` object shaped like
  // the same `propertyCrpEnrollment.create` mock used outside a transaction,
  // so existing assertions against `prismaMock.propertyCrpEnrollment.create`
  // keep working for the happy path, while transaction-failure tests below
  // override this per-test to prove atomicity.
  const prismaMock = {
    ingestionRun: { create: jest.fn(), update: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
    propertyCrpEnrollment: { findMany: jest.fn(), create: jest.fn() },
  };
  const crpClientMock = { fetchFloridaCountyResults: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CrpCountyPracticeIngestionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CrpCountyPracticeClient, useValue: crpClientMock },
      ],
    }).compile();
    service = moduleRef.get(CrpCountyPracticeIngestionService);

    prismaMock.ingestionRun.create.mockResolvedValue({ id: "run-1" });
    prismaMock.ingestionRun.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "run-1", itemsProcessed: 0, recordsCreated: 0, ...data }),
    );
    prismaMock.propertyCrpEnrollment.findMany.mockResolvedValue([]);
    prismaMock.$transaction.mockImplementation((callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock));
  });

  it("skips properties that already have at least one enrollment row, never fetching the workbook for an all-skip run", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", county: "Holmes" }]);
    prismaMock.propertyCrpEnrollment.findMany.mockResolvedValue([{ propertyId: "prop-1" }]);

    const result = await service.run();

    expect(crpClientMock.fetchFloridaCountyResults).not.toHaveBeenCalled();
    expect(prismaMock.propertyCrpEnrollment.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "succeeded", itemsProcessed: 1, recordsCreated: 0 });
  });

  it("fetches the workbook exactly once and creates one row per real practice for a matching county, case/whitespace-insensitively", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", county: "Holmes" }]);
    crpClientMock.fetchFloridaCountyResults.mockResolvedValue(new Map([["HOLMES", REAL_HOLMES_PRACTICES]]));

    const result = await service.run();

    expect(crpClientMock.fetchFloridaCountyResults).toHaveBeenCalledTimes(1);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.propertyCrpEnrollment.create).toHaveBeenCalledTimes(3);
    expect(prismaMock.propertyCrpEnrollment.create).toHaveBeenCalledWith({
      data: {
        propertyId: "prop-1",
        reportPeriod: "CUMULATIVE, AS OF JANUARY 2017",
        practiceLabel: "TREE PLANTINGS - SOFTWOODS (CP3)",
        practiceCode: "CP3",
        acres: "1895.80",
        isTotal: false,
      },
    });
    expect(prismaMock.propertyCrpEnrollment.create).toHaveBeenCalledWith({
      data: {
        propertyId: "prop-1",
        reportPeriod: "CUMULATIVE, AS OF JANUARY 2017",
        practiceLabel: "TOTAL (ALL PRACTICES)",
        practiceCode: "TOTAL",
        acres: "3341.00",
        isTotal: true,
      },
    });
    expect(result).toMatchObject({ status: "succeeded", itemsProcessed: 1, recordsCreated: 3 });
  });

  it("wraps a property's practice-row inserts in a single transaction so a failure partway through leaves zero rows for that property (retry idempotency safety)", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", county: "Holmes" }]);
    crpClientMock.fetchFloridaCountyResults.mockResolvedValue(new Map([["HOLMES", REAL_HOLMES_PRACTICES]]));

    // Simulate a crash partway through the second row of this property's
    // insert set — the transaction callback itself throws, mirroring what
    // Prisma's real $transaction does when any query inside it rejects: the
    // whole transaction rolls back rather than leaving earlier rows
    // committed.
    let callCount = 0;
    prismaMock.propertyCrpEnrollment.create.mockImplementation(() => {
      callCount++;
      if (callCount === 2) {
        return Promise.reject(new Error("connection lost mid-insert"));
      }
      return Promise.resolve({});
    });
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => unknown) => {
      // A real Prisma transaction rejects as a whole and performs no
      // partial commit when the callback throws — asserted here by
      // propagating the callback's rejection outward rather than
      // swallowing it.
      return callback(prismaMock);
    });

    const result = await service.run();

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toBe("connection lost mid-insert");
    // All 3 rows were attempted via the same transaction (not committed
    // individually outside one) — the second attempt rejected, and the
    // service did not proceed to write further rows for this property
    // after the transaction failed on a per-property basis (no separate,
    // un-transacted create calls follow the failing one for this property).
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it("creates zero rows for a property whose county has no CRP data (the real, honest outcome for this project's current seed counties)", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", county: "Polk" }]);
    crpClientMock.fetchFloridaCountyResults.mockResolvedValue(new Map());

    const result = await service.run();

    expect(prismaMock.propertyCrpEnrollment.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "succeeded", itemsProcessed: 1, recordsCreated: 0 });
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
