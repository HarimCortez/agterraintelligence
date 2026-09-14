import { Test } from "@nestjs/testing";

// `cropland-data-client.ts` (pulled in transitively via
// `CroplandCoverIngestionService`) statically imports the real
// ESM-only-published `geotiff`/`proj4` packages, which Jest's CJS transform
// can't parse. This suite only exercises `AdminIngestionService` against a
// mocked `CroplandCoverIngestionService`, never the real client, so stub
// both modules before anything imports it — see the identical comment in
// `../ingestion/cropland-cover-ingestion.service.spec.ts`.
jest.mock("geotiff", () => ({ fromUrl: jest.fn() }));
jest.mock("proj4", () => Object.assign(jest.fn(), { defs: jest.fn() }));

import { PrismaService } from "../common/prisma/prisma.service";
import { AuditLogService } from "../common/audit/audit-log.service";
import { AuthenticatedAdminUser } from "../identity-access/admin/admin.types";
import { FemaFloodZoneIngestionService } from "../ingestion/fema-flood-zone-ingestion.service";
import { FlParcelCadastralIngestionService } from "../ingestion/fl-parcel-cadastral-ingestion.service";
import { UsdaSoilIngestionService } from "../ingestion/usda-soil-ingestion.service";
import { WetlandsIngestionService } from "../ingestion/wetlands-ingestion.service";
import { CitrusQuarantineIngestionService } from "../ingestion/citrus-quarantine-ingestion.service";
import { CitrusBlackSpotIngestionService } from "../ingestion/citrus-black-spot-ingestion.service";
import { CroplandCoverIngestionService } from "../ingestion/cropland-cover-ingestion.service";
import { NassAgCensusIngestionService } from "../ingestion/nass-ag-census-ingestion.service";
import { FiaTimberIngestionService } from "../ingestion/fia-timber-ingestion.service";
import { RmaCauseOfLossIngestionService } from "../ingestion/rma-cause-of-loss-ingestion.service";
import { AdminIngestionService } from "./admin-ingestion.service";

const ADMIN: AuthenticatedAdminUser = {
  id: "admin-1",
  email: "admin@example.com",
  internalRole: "super_admin",
  status: "active",
  mfaEnrolled: false,
};

describe("AdminIngestionService", () => {
  let service: AdminIngestionService;

  const prismaMock = {
    ingestionRun: { findMany: jest.fn(), count: jest.fn() },
    parcelRecord: { findMany: jest.fn(), count: jest.fn() },
  };
  const femaIngestionMock = { trigger: jest.fn() };
  const flParcelIngestionMock = { trigger: jest.fn() };
  const usdaSoilIngestionMock = { trigger: jest.fn() };
  const wetlandsIngestionMock = { trigger: jest.fn() };
  const citrusQuarantineIngestionMock = { trigger: jest.fn() };
  const citrusBlackSpotIngestionMock = { trigger: jest.fn() };
  const croplandCoverIngestionMock = { trigger: jest.fn() };
  const nassAgCensusIngestionMock = { trigger: jest.fn() };
  const fiaTimberIngestionMock = { trigger: jest.fn() };
  const rmaCauseOfLossIngestionMock = { trigger: jest.fn() };
  const auditLogMock = { record: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminIngestionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: FemaFloodZoneIngestionService, useValue: femaIngestionMock },
        { provide: FlParcelCadastralIngestionService, useValue: flParcelIngestionMock },
        { provide: UsdaSoilIngestionService, useValue: usdaSoilIngestionMock },
        { provide: WetlandsIngestionService, useValue: wetlandsIngestionMock },
        { provide: CitrusQuarantineIngestionService, useValue: citrusQuarantineIngestionMock },
        { provide: CitrusBlackSpotIngestionService, useValue: citrusBlackSpotIngestionMock },
        { provide: CroplandCoverIngestionService, useValue: croplandCoverIngestionMock },
        { provide: NassAgCensusIngestionService, useValue: nassAgCensusIngestionMock },
        { provide: FiaTimberIngestionService, useValue: fiaTimberIngestionMock },
        { provide: RmaCauseOfLossIngestionService, useValue: rmaCauseOfLossIngestionMock },
        { provide: AuditLogService, useValue: auditLogMock },
      ],
    }).compile();
    service = moduleRef.get(AdminIngestionService);
  });

  describe("listRuns", () => {
    it("applies default limit/offset and returns total alongside results", async () => {
      prismaMock.ingestionRun.findMany.mockResolvedValue([{ id: "run-1" }]);
      prismaMock.ingestionRun.count.mockResolvedValue(1);

      const result = await service.listRuns({});

      expect(prismaMock.ingestionRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { startedAt: "desc" }, take: 20, skip: 0 }),
      );
      expect(result).toEqual({ results: [{ id: "run-1" }], total: 1, limit: 20, offset: 0 });
    });
  });

  describe("triggerFemaFloodZoneRun", () => {
    it("starts the run in the background and returns immediately with a 'running' status, not waiting for completion", async () => {
      femaIngestionMock.trigger.mockResolvedValue({ id: "run-1" });

      const result = await service.triggerFemaFloodZoneRun(ADMIN);

      expect(femaIngestionMock.trigger).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        id: "run-1",
        status: "running",
        itemsProcessed: 0,
        recordsCreated: 0,
        errorMessage: null,
      });
    });

    it("records an audit entry for the trigger action itself, not the eventual run outcome", async () => {
      femaIngestionMock.trigger.mockResolvedValue({ id: "run-1" });

      await service.triggerFemaFloodZoneRun(ADMIN);

      expect(auditLogMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: "admin-1",
          actorEmail: "admin@example.com",
          action: "ingestion.run",
          targetType: "ingestion_run",
          targetId: "run-1",
          metadata: { source: "fema_flood_zones" },
        }),
      );
    });
  });

  describe("triggerFlParcelRun", () => {
    it("starts the run in the background and returns immediately with a 'running' status", async () => {
      flParcelIngestionMock.trigger.mockResolvedValue({ id: "run-2" });

      const result = await service.triggerFlParcelRun(ADMIN);

      expect(flParcelIngestionMock.trigger).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        id: "run-2",
        status: "running",
        itemsProcessed: 0,
        recordsCreated: 0,
        errorMessage: null,
      });
    });

    it("records an audit entry tagged with the fl_dor_cadastral source", async () => {
      flParcelIngestionMock.trigger.mockResolvedValue({ id: "run-2" });

      await service.triggerFlParcelRun(ADMIN);

      expect(auditLogMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: "admin-1",
          actorEmail: "admin@example.com",
          action: "ingestion.run",
          targetType: "ingestion_run",
          targetId: "run-2",
          metadata: { source: "fl_dor_cadastral" },
        }),
      );
    });
  });

  describe("triggerUsdaSoilRun", () => {
    it("starts the run in the background and returns immediately with a 'running' status", async () => {
      usdaSoilIngestionMock.trigger.mockResolvedValue({ id: "run-3" });

      const result = await service.triggerUsdaSoilRun(ADMIN);

      expect(usdaSoilIngestionMock.trigger).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        id: "run-3",
        status: "running",
        itemsProcessed: 0,
        recordsCreated: 0,
        errorMessage: null,
      });
    });

    it("records an audit entry tagged with the usda_soil_data source", async () => {
      usdaSoilIngestionMock.trigger.mockResolvedValue({ id: "run-3" });

      await service.triggerUsdaSoilRun(ADMIN);

      expect(auditLogMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: "admin-1",
          actorEmail: "admin@example.com",
          action: "ingestion.run",
          targetType: "ingestion_run",
          targetId: "run-3",
          metadata: { source: "usda_soil_data" },
        }),
      );
    });
  });

  describe("triggerWetlandsRun", () => {
    it("starts the run in the background and returns immediately with a 'running' status", async () => {
      wetlandsIngestionMock.trigger.mockResolvedValue({ id: "run-4" });

      const result = await service.triggerWetlandsRun(ADMIN);

      expect(wetlandsIngestionMock.trigger).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        id: "run-4",
        status: "running",
        itemsProcessed: 0,
        recordsCreated: 0,
        errorMessage: null,
      });
    });

    it("records an audit entry tagged with the usfws_wetlands source", async () => {
      wetlandsIngestionMock.trigger.mockResolvedValue({ id: "run-4" });

      await service.triggerWetlandsRun(ADMIN);

      expect(auditLogMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: "admin-1",
          actorEmail: "admin@example.com",
          action: "ingestion.run",
          targetType: "ingestion_run",
          targetId: "run-4",
          metadata: { source: "usfws_wetlands" },
        }),
      );
    });
  });

  describe("triggerCitrusQuarantineRun", () => {
    it("starts the run in the background and returns immediately with a 'running' status", async () => {
      citrusQuarantineIngestionMock.trigger.mockResolvedValue({ id: "run-5" });

      const result = await service.triggerCitrusQuarantineRun(ADMIN);

      expect(citrusQuarantineIngestionMock.trigger).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        id: "run-5",
        status: "running",
        itemsProcessed: 0,
        recordsCreated: 0,
        errorMessage: null,
      });
    });

    it("records an audit entry tagged with the usda_aphis_citrus_quarantine source", async () => {
      citrusQuarantineIngestionMock.trigger.mockResolvedValue({ id: "run-5" });

      await service.triggerCitrusQuarantineRun(ADMIN);

      expect(auditLogMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: "admin-1",
          actorEmail: "admin@example.com",
          action: "ingestion.run",
          targetType: "ingestion_run",
          targetId: "run-5",
          metadata: { source: "usda_aphis_citrus_quarantine" },
        }),
      );
    });
  });

  describe("triggerCitrusBlackSpotRun", () => {
    it("starts the run in the background and returns immediately with a 'running' status", async () => {
      citrusBlackSpotIngestionMock.trigger.mockResolvedValue({ id: "run-7" });

      const result = await service.triggerCitrusBlackSpotRun(ADMIN);

      expect(citrusBlackSpotIngestionMock.trigger).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        id: "run-7",
        status: "running",
        itemsProcessed: 0,
        recordsCreated: 0,
        errorMessage: null,
      });
    });

    it("records an audit entry tagged with the usda_aphis_citrus_black_spot source", async () => {
      citrusBlackSpotIngestionMock.trigger.mockResolvedValue({ id: "run-7" });

      await service.triggerCitrusBlackSpotRun(ADMIN);

      expect(auditLogMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: "admin-1",
          actorEmail: "admin@example.com",
          action: "ingestion.run",
          targetType: "ingestion_run",
          targetId: "run-7",
          metadata: { source: "usda_aphis_citrus_black_spot" },
        }),
      );
    });
  });

  describe("triggerCroplandCoverRun", () => {
    it("starts the run in the background and returns immediately with a 'running' status", async () => {
      croplandCoverIngestionMock.trigger.mockResolvedValue({ id: "run-6" });

      const result = await service.triggerCroplandCoverRun(ADMIN);

      expect(croplandCoverIngestionMock.trigger).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        id: "run-6",
        status: "running",
        itemsProcessed: 0,
        recordsCreated: 0,
        errorMessage: null,
      });
    });

    it("records an audit entry tagged with the usda_nass_cropland_data_layer source", async () => {
      croplandCoverIngestionMock.trigger.mockResolvedValue({ id: "run-6" });

      await service.triggerCroplandCoverRun(ADMIN);

      expect(auditLogMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: "admin-1",
          actorEmail: "admin@example.com",
          action: "ingestion.run",
          targetType: "ingestion_run",
          targetId: "run-6",
          metadata: { source: "usda_nass_cropland_data_layer" },
        }),
      );
    });
  });

  describe("triggerNassAgCensusRun", () => {
    it("starts the run in the background and returns immediately with a 'running' status", async () => {
      nassAgCensusIngestionMock.trigger.mockResolvedValue({ id: "run-8" });

      const result = await service.triggerNassAgCensusRun(ADMIN);

      expect(nassAgCensusIngestionMock.trigger).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        id: "run-8",
        status: "running",
        itemsProcessed: 0,
        recordsCreated: 0,
        errorMessage: null,
      });
    });

    it("records an audit entry tagged with the usda_nass_ag_census source", async () => {
      nassAgCensusIngestionMock.trigger.mockResolvedValue({ id: "run-8" });

      await service.triggerNassAgCensusRun(ADMIN);

      expect(auditLogMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: "admin-1",
          actorEmail: "admin@example.com",
          action: "ingestion.run",
          targetType: "ingestion_run",
          targetId: "run-8",
          metadata: { source: "usda_nass_ag_census" },
        }),
      );
    });
  });

  describe("triggerFiaTimberRun", () => {
    it("starts the run in the background and returns immediately with a 'running' status", async () => {
      fiaTimberIngestionMock.trigger.mockResolvedValue({ id: "run-9" });

      const result = await service.triggerFiaTimberRun(ADMIN);

      expect(fiaTimberIngestionMock.trigger).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        id: "run-9",
        status: "running",
        itemsProcessed: 0,
        recordsCreated: 0,
        errorMessage: null,
      });
    });

    it("records an audit entry tagged with the usda_fs_fia_timber source", async () => {
      fiaTimberIngestionMock.trigger.mockResolvedValue({ id: "run-9" });

      await service.triggerFiaTimberRun(ADMIN);

      expect(auditLogMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: "admin-1",
          actorEmail: "admin@example.com",
          action: "ingestion.run",
          targetType: "ingestion_run",
          targetId: "run-9",
          metadata: { source: "usda_fs_fia_timber" },
        }),
      );
    });
  });

  describe("triggerRmaCauseOfLossRun", () => {
    it("starts the run in the background and returns immediately with a 'running' status", async () => {
      rmaCauseOfLossIngestionMock.trigger.mockResolvedValue({ id: "run-10" });

      const result = await service.triggerRmaCauseOfLossRun(ADMIN);

      expect(rmaCauseOfLossIngestionMock.trigger).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        id: "run-10",
        status: "running",
        itemsProcessed: 0,
        recordsCreated: 0,
        errorMessage: null,
      });
    });

    it("records an audit entry tagged with the usda_rma_cause_of_loss source", async () => {
      rmaCauseOfLossIngestionMock.trigger.mockResolvedValue({ id: "run-10" });

      await service.triggerRmaCauseOfLossRun(ADMIN);

      expect(auditLogMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: "admin-1",
          actorEmail: "admin@example.com",
          action: "ingestion.run",
          targetType: "ingestion_run",
          targetId: "run-10",
          metadata: { source: "usda_rma_cause_of_loss" },
        }),
      );
    });
  });

  describe("listParcelRecords", () => {
    it("applies default limit/offset, no county filter, and stringifies the Decimal acreage", async () => {
      prismaMock.parcelRecord.findMany.mockResolvedValue([{ id: "p1", acreage: { toString: () => "82.30" } }]);
      prismaMock.parcelRecord.count.mockResolvedValue(1);

      const result = await service.listParcelRecords({});

      expect(prismaMock.parcelRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {}, orderBy: { ingestedAt: "desc" }, take: 20, skip: 0 }),
      );
      expect(result).toEqual({ results: [{ id: "p1", acreage: "82.30" }], total: 1, limit: 20, offset: 0 });
    });

    it("filters by county when provided", async () => {
      prismaMock.parcelRecord.findMany.mockResolvedValue([]);
      prismaMock.parcelRecord.count.mockResolvedValue(0);

      await service.listParcelRecords({ county: "Polk" });

      expect(prismaMock.parcelRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { county: "Polk" } }),
      );
      expect(prismaMock.parcelRecord.count).toHaveBeenCalledWith({ where: { county: "Polk" } });
    });
  });
});
