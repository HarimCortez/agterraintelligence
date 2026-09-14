import { Test } from "@nestjs/testing";
import { PrismaService } from "../common/prisma/prisma.service";

// `cropland-data-client.ts` statically imports the real `geotiff`/`proj4`
// packages, both real ESM-only-published libraries that Jest's CJS
// transform can't parse directly (see this suite's git history — a
// `moduleNameMapper`/`customExportConditions` redirect to their CJS builds
// was tried and didn't stick, due to how Jest's resolver walks package
// "exports" maps). These tests only exercise `CroplandCoverIngestionService`
// against a mocked `CroplandDataClient`, never the real geotiff/proj4 code
// paths, so stub both modules before anything imports the client
// transitively — the real client's correctness was verified live (see its
// doc comment), not by a unit test that would need to re-mock a remote
// Cloud-Optimized GeoTIFF read.
jest.mock("geotiff", () => ({ fromUrl: jest.fn() }));
jest.mock("proj4", () => Object.assign(jest.fn(), { defs: jest.fn() }));

import { CroplandCoverIngestionService } from "./cropland-cover-ingestion.service";
import { CroplandDataClient } from "./cropland-data-client";

const CROP_COVER_RESULT = {
  year: 2021,
  cropCode: 212,
  cropDescription: "Oranges",
};

describe("CroplandCoverIngestionService", () => {
  let service: CroplandCoverIngestionService;

  const prismaMock = {
    ingestionRun: { create: jest.fn(), update: jest.fn() },
    $queryRaw: jest.fn(),
    propertyCropCover: { findMany: jest.fn(), create: jest.fn() },
  };
  const croplandClientMock = { queryPointCropCover: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CroplandCoverIngestionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CroplandDataClient, useValue: croplandClientMock },
      ],
    }).compile();
    service = moduleRef.get(CroplandCoverIngestionService);

    prismaMock.ingestionRun.create.mockResolvedValue({ id: "run-1" });
    prismaMock.ingestionRun.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "run-1", itemsProcessed: 0, recordsCreated: 0, ...data }),
    );
    prismaMock.propertyCropCover.findMany.mockResolvedValue([]);
  });

  it("skips properties that already have a crop cover reading, never querying the client for them", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", lat: 27.22, lng: -81.47 }]);
    prismaMock.propertyCropCover.findMany.mockResolvedValue([{ propertyId: "prop-1" }]);

    const result = await service.run();

    expect(croplandClientMock.queryPointCropCover).not.toHaveBeenCalled();
    expect(prismaMock.propertyCropCover.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "succeeded", itemsProcessed: 1, recordsCreated: 0 });
  });

  it("creates a PropertyCropCover row for each property with a real result", async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      { id: "prop-1", lat: 27.52, lng: -81.47 },
      { id: "prop-2", lat: 27.22, lng: -80.78 },
    ]);
    croplandClientMock.queryPointCropCover.mockResolvedValue(CROP_COVER_RESULT);

    const result = await service.run();

    expect(prismaMock.propertyCropCover.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.propertyCropCover.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          propertyId: "prop-1",
          year: 2021,
          cropCode: 212,
          cropDescription: "Oranges",
        }),
      }),
    );
    expect(result).toMatchObject({ status: "succeeded", itemsProcessed: 2, recordsCreated: 2 });
  });

  it("does not create a row when the client returns null (no coverage / request failure) for a point", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: "prop-1", lat: 0, lng: 0 }]);
    croplandClientMock.queryPointCropCover.mockResolvedValue(null);

    const result = await service.run();

    expect(prismaMock.propertyCropCover.create).not.toHaveBeenCalled();
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
