import { Test } from "@nestjs/testing";
import { PrismaService } from "../common/prisma/prisma.service";
import { FlParcelClient } from "./fl-parcel-client";
import { FlParcelCadastralIngestionService } from "./fl-parcel-cadastral-ingestion.service";

const AG_FEATURE = {
  parcelId: "013723000000100000",
  dorUseCode: "061",
  ownerName: "VCH HOLDINGS LLC",
  siteAddress: "NW LILY AVE",
  siteCity: "ARCADIA",
  legalDescription: "N1/2 OF NW1/4",
  totalValueDollars: 640_000,
  acreage: 82.3,
};

describe("FlParcelCadastralIngestionService", () => {
  let service: FlParcelCadastralIngestionService;

  const prismaMock = {
    ingestionRun: { create: jest.fn(), update: jest.fn() },
    parcelRecord: { findMany: jest.fn(), create: jest.fn() },
  };
  const flParcelClientMock = { queryAgriculturalParcels: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        FlParcelCadastralIngestionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: FlParcelClient, useValue: flParcelClientMock },
      ],
    }).compile();
    service = moduleRef.get(FlParcelCadastralIngestionService);

    prismaMock.ingestionRun.create.mockResolvedValue({ id: "run-1" });
    prismaMock.ingestionRun.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "run-1", itemsProcessed: 0, recordsCreated: 0, ...data }),
    );
    prismaMock.parcelRecord.findMany.mockResolvedValue([]);
  });

  it("sweeps all 4 target counties and creates a ParcelRecord for each new agricultural parcel", async () => {
    flParcelClientMock.queryAgriculturalParcels.mockResolvedValue([AG_FEATURE]);

    const result = await service.run();

    expect(flParcelClientMock.queryAgriculturalParcels).toHaveBeenCalledTimes(4);
    expect(prismaMock.parcelRecord.create).toHaveBeenCalledTimes(4);
    expect(prismaMock.parcelRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: "fl_dor_cadastral",
          parcelId: "013723000000100000",
          dorUseCode: "061",
          dorUseDescription: "Grazing land soil capability Class II",
          acreage: "82.30",
          justValueCents: 64_000_000,
        }),
      }),
    );
    expect(result).toMatchObject({ status: "succeeded", itemsProcessed: 4, recordsCreated: 4 });
  });

  it("skips a parcel already ingested (same source+parcelId), never re-creating it", async () => {
    flParcelClientMock.queryAgriculturalParcels.mockResolvedValue([AG_FEATURE]);
    prismaMock.parcelRecord.findMany.mockResolvedValue([{ parcelId: AG_FEATURE.parcelId }]);

    const result = await service.run();

    expect(prismaMock.parcelRecord.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "succeeded", itemsProcessed: 4, recordsCreated: 0 });
  });

  it("skips a parcel missing total value or acreage rather than fabricating one", async () => {
    flParcelClientMock.queryAgriculturalParcels.mockResolvedValue([
      { ...AG_FEATURE, totalValueDollars: null },
      { ...AG_FEATURE, parcelId: "other-parcel", acreage: null },
    ]);

    const result = await service.run();

    expect(prismaMock.parcelRecord.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "succeeded", recordsCreated: 0 });
  });

  it("skips a parcel whose value would overflow the storable cents range", async () => {
    flParcelClientMock.queryAgriculturalParcels.mockResolvedValue([
      { ...AG_FEATURE, totalValueDollars: 30_000_000_000 },
    ]);

    await service.run();

    expect(prismaMock.parcelRecord.create).not.toHaveBeenCalled();
  });

  it("marks the run failed (not throwing) and records the error message when a county sweep fails", async () => {
    flParcelClientMock.queryAgriculturalParcels.mockRejectedValue(new Error("FL parcel query returned HTTP 504"));

    const result = await service.run();

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toBe("FL parcel query returned HTTP 504");
    expect(prismaMock.ingestionRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run-1" },
        data: expect.objectContaining({ status: "failed", errorMessage: "FL parcel query returned HTTP 504" }),
      }),
    );
  });

  describe("trigger", () => {
    it("returns the new run id immediately, without waiting for the county sweep to finish", async () => {
      let resolveQuery!: (features: unknown[]) => void;
      flParcelClientMock.queryAgriculturalParcels.mockReturnValue(new Promise((resolve) => (resolveQuery = resolve)));

      const result = await service.trigger();

      expect(result).toEqual({ id: "run-1" });
      expect(prismaMock.ingestionRun.update).not.toHaveBeenCalled();

      resolveQuery([]);
      await new Promise((resolve) => setImmediate(resolve));
    });
  });
});
