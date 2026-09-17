import { Test } from "@nestjs/testing";
import { PrismaService } from "../common/prisma/prisma.service";
import { FsaResaleClient } from "./fsa-resale-client";
import { FsaResaleIngestionService } from "./fsa-resale-ingestion.service";

describe("FsaResaleIngestionService", () => {
  let service: FsaResaleIngestionService;

  const prismaMock = {
    ingestionRun: { create: jest.fn(), update: jest.fn() },
    fsaResaleListing: { findFirst: jest.fn(), create: jest.fn() },
  };
  const fsaResaleClientMock = {
    searchFarmAndRanch: jest.fn(),
    searchSingleFamily: jest.fn(),
    searchMultiFamily: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        FsaResaleIngestionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: FsaResaleClient, useValue: fsaResaleClientMock },
      ],
    }).compile();
    service = moduleRef.get(FsaResaleIngestionService);

    prismaMock.ingestionRun.create.mockResolvedValue({ id: "run-1" });
    prismaMock.ingestionRun.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "run-1", itemsProcessed: 0, recordsCreated: 0, ...data }),
    );
    fsaResaleClientMock.searchFarmAndRanch.mockResolvedValue([]);
    fsaResaleClientMock.searchSingleFamily.mockResolvedValue([]);
    fsaResaleClientMock.searchMultiFamily.mockResolvedValue([]);
  });

  it("searches nationwide (no state filter) across all three real property types — this project's standing nationwide-scope principle", async () => {
    await service.run();

    expect(fsaResaleClientMock.searchFarmAndRanch).toHaveBeenCalledWith();
    expect(fsaResaleClientMock.searchSingleFamily).toHaveBeenCalledWith();
    expect(fsaResaleClientMock.searchMultiFamily).toHaveBeenCalledWith();
  });

  it("succeeds with zero records created when the real current inventory is empty (the confirmed-live current state of this source, across all three types)", async () => {
    const result = await service.run();

    expect(prismaMock.fsaResaleListing.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "succeeded", itemsProcessed: 0, recordsCreated: 0 });
  });

  it("creates a new listing row for a real Farm & Ranch listing not already ingested, tagged with its propertyType", async () => {
    fsaResaleClientMock.searchFarmAndRanch.mockResolvedValue([
      {
        propertyType: "Farm & Ranch",
        state: "PA",
        county: "Crawford",
        city: "Springboro",
        zip: "16435",
        streetAddress: "7624 Beaver Street",
        listingType: "REO Property",
        priceCents: 12_000_000,
        totalAcres: 30,
        bedrooms: null,
        bathrooms: null,
        squareFeet: null,
        totalUnits: null,
      },
    ]);
    prismaMock.fsaResaleListing.findFirst.mockResolvedValue(null);

    const result = await service.run();

    expect(prismaMock.fsaResaleListing.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ propertyType: "Farm & Ranch" }),
      }),
    );
    expect(prismaMock.fsaResaleListing.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        source: "usda_rd_fsa_resales",
        propertyType: "Farm & Ranch",
        state: "PA",
        county: "Crawford",
        streetAddress: "7624 Beaver Street",
        priceCents: 12_000_000,
        totalAcres: "30.00",
        bedrooms: null,
        bathrooms: null,
        squareFeet: null,
        totalUnits: null,
      }),
    });
    expect(result).toMatchObject({ status: "succeeded", itemsProcessed: 1, recordsCreated: 1 });
  });

  it("creates a new listing row for a real Single Family listing, storing bedrooms/bathrooms/squareFeet", async () => {
    fsaResaleClientMock.searchSingleFamily.mockResolvedValue([
      {
        propertyType: "Single Family",
        state: "KS",
        county: "Seward",
        city: "Liberal",
        zip: "67901",
        streetAddress: "341 Harold Blvd",
        listingType: "Foreclosure",
        priceCents: 7_140_000,
        totalAcres: null,
        bedrooms: 3,
        bathrooms: 2,
        squareFeet: 1149,
        totalUnits: null,
      },
    ]);
    prismaMock.fsaResaleListing.findFirst.mockResolvedValue(null);

    const result = await service.run();

    expect(prismaMock.fsaResaleListing.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        propertyType: "Single Family",
        bedrooms: 3,
        bathrooms: "2.0",
        squareFeet: 1149,
        totalUnits: null,
      }),
    });
    expect(result).toMatchObject({ status: "succeeded", itemsProcessed: 1, recordsCreated: 1 });
  });

  it("creates a new listing row for a real Multi-Family listing, storing totalUnits", async () => {
    fsaResaleClientMock.searchMultiFamily.mockResolvedValue([
      {
        propertyType: "Multi-Family",
        state: "MO",
        county: "Camden",
        city: "Camdenton",
        zip: "65432",
        streetAddress: "12345 Marine Drive",
        listingType: "REO Property",
        priceCents: 125_000_000,
        totalAcres: null,
        bedrooms: null,
        bathrooms: null,
        squareFeet: null,
        totalUnits: 8,
      },
    ]);
    prismaMock.fsaResaleListing.findFirst.mockResolvedValue(null);

    const result = await service.run();

    expect(prismaMock.fsaResaleListing.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        propertyType: "Multi-Family",
        totalUnits: 8,
      }),
    });
    expect(result).toMatchObject({ status: "succeeded", itemsProcessed: 1, recordsCreated: 1 });
  });

  it("skips a listing that matches the natural key (including propertyType) of one already ingested", async () => {
    fsaResaleClientMock.searchFarmAndRanch.mockResolvedValue([
      {
        propertyType: "Farm & Ranch",
        state: "PA",
        county: "Crawford",
        city: "Springboro",
        zip: "16435",
        streetAddress: "7624 Beaver Street",
        listingType: "REO Property",
        priceCents: 12_000_000,
        totalAcres: 30,
        bedrooms: null,
        bathrooms: null,
        squareFeet: null,
        totalUnits: null,
      },
    ]);
    prismaMock.fsaResaleListing.findFirst.mockResolvedValue({ id: "existing-1" });

    const result = await service.run();

    expect(prismaMock.fsaResaleListing.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "succeeded", itemsProcessed: 1, recordsCreated: 0 });
  });

  it("marks the run failed (not throwing) and records the error message when an unexpected error occurs", async () => {
    fsaResaleClientMock.searchFarmAndRanch.mockRejectedValue(new Error("connection terminated"));

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
      let resolveSearch!: (rows: unknown[]) => void;
      fsaResaleClientMock.searchFarmAndRanch.mockReturnValue(new Promise((resolve) => (resolveSearch = resolve)));

      const result = await service.trigger();

      expect(result).toEqual({ id: "run-1" });
      expect(prismaMock.ingestionRun.update).not.toHaveBeenCalled();

      resolveSearch([]);
      await new Promise((resolve) => setImmediate(resolve));
    });
  });
});
