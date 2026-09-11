import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditLogService } from "../common/audit/audit-log.service";
import { AuthenticatedAdminUser } from "../identity-access/admin/admin.types";
import { AdminDataQualityService } from "./admin-data-quality.service";

const ADMIN: AuthenticatedAdminUser = {
  id: "admin-1",
  email: "admin@example.com",
  internalRole: "data_qa_reviewer",
  status: "active",
  mfaEnrolled: false,
};

describe("AdminDataQualityService", () => {
  let service: AdminDataQualityService;

  const prismaMock = {
    propertyValuation: { groupBy: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    property: { count: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
    propertyRiskFlag: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
    $queryRawUnsafe: jest.fn(),
  };
  const auditLogMock = { record: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminDataQualityService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditLogService, useValue: auditLogMock },
      ],
    }).compile();
    service = moduleRef.get(AdminDataQualityService);
  });

  describe("getSummary", () => {
    it("fills in zero for confidence levels with no rows, rather than omitting them", async () => {
      prismaMock.propertyValuation.groupBy.mockResolvedValue([{ confidence: "verified", _count: { _all: 6 } }]);
      prismaMock.property.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
      prismaMock.$queryRaw.mockResolvedValue([{ count: BigInt(3) }]);
      prismaMock.propertyRiskFlag.findMany.mockResolvedValue([{ propertyId: "p1" }, { propertyId: "p2" }]);

      const result = await service.getSummary();

      expect(result.countByConfidence).toEqual({ verified: 6, modeled: 0, ai_inferred: 0, unknown: 0 });
      expect(result.propertiesMissingValuation).toBe(2);
      expect(result.propertiesMissingScore).toBe(1);
      expect(result.possibleDuplicateProperties).toBe(3);
      expect(result.flaggedPropertiesCount).toBe(2);
    });
  });

  describe("listProperties", () => {
    it("appends the issue-specific WHERE clause for each issue filter", async () => {
      prismaMock.$queryRawUnsafe.mockResolvedValue([]);

      await service.listProperties({ issue: "possible_duplicate", limit: 10, offset: 0 });

      const [sql] = prismaMock.$queryRawUnsafe.mock.calls[0];
      expect(sql).toContain("dup.addr_key IS NOT NULL");
    });

    it("maps computed boolean columns into the issues array", async () => {
      prismaMock.$queryRawUnsafe.mockResolvedValue([
        {
          id: "p1",
          address: "1 Main St",
          county: "Polk",
          confidence: "unknown",
          riskFlagCount: BigInt(2),
          missingValuation: false,
          missingScore: true,
          possibleDuplicate: false,
          updatedAt: new Date(),
          totalCount: BigInt(1),
        },
      ]);

      const result = await service.listProperties({});

      expect(result.results[0]!.issues).toEqual(["missing_score", "has_risk_flags"]);
      expect(result.total).toBe(1);
    });
  });

  describe("getPropertyDetail", () => {
    it("404s when the property doesn't exist", async () => {
      prismaMock.property.findUnique.mockResolvedValue(null);

      await expect(service.getPropertyDetail("missing")).rejects.toBeInstanceOf(NotFoundException);
    });

    it("computes all four issue types correctly from real joined data", async () => {
      prismaMock.property.findUnique.mockResolvedValue({
        id: "p1",
        address: "1 Main St",
        county: "Polk",
        updatedAt: new Date(),
        acreage: { toString: () => "100.00" },
        askingPriceCents: 100000,
        landUseType: "row_crop",
        opportunityScore: null,
        valuation: null,
        riskFlags: [{ id: "f1", riskType: "flood_zone", severity: "high", description: "d", createdAt: new Date() }],
        aiInteractions: [],
      });
      prismaMock.$queryRaw.mockResolvedValue([{ lat: 27.2, lng: -80.8 }]);
      prismaMock.property.findMany.mockResolvedValue([{ id: "p2", address: "1 Main St", county: "Polk" }]);

      const result = await service.getPropertyDetail("p1");

      expect(result.issues).toEqual(["missing_valuation", "missing_score", "possible_duplicate", "has_risk_flags"]);
      expect(result.duplicateCandidates).toEqual([{ id: "p2", address: "1 Main St", county: "Polk" }]);
    });
  });

  describe("verifyProperty", () => {
    it("rejects when the property has no valuation to verify", async () => {
      prismaMock.propertyValuation.findUnique.mockResolvedValue(null);

      await expect(service.verifyProperty("p1", ADMIN)).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.propertyValuation.update).not.toHaveBeenCalled();
    });

    it("rejects when already verified", async () => {
      prismaMock.propertyValuation.findUnique.mockResolvedValue({ confidence: "verified" });

      await expect(service.verifyProperty("p1", ADMIN)).rejects.toBeInstanceOf(ConflictException);
      expect(prismaMock.propertyValuation.update).not.toHaveBeenCalled();
    });

    it("updates confidence to verified and records the previous value in the audit entry", async () => {
      prismaMock.propertyValuation.findUnique.mockResolvedValue({ confidence: "modeled" });

      const result = await service.verifyProperty("p1", ADMIN);

      expect(prismaMock.propertyValuation.update).toHaveBeenCalledWith({
        where: { propertyId: "p1" },
        data: { confidence: "verified" },
      });
      expect(result).toEqual({ id: "p1", confidence: "verified" });
      expect(auditLogMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "data_quality.verify",
          targetType: "property",
          targetId: "p1",
          metadata: { previousConfidence: "modeled" },
        }),
      );
    });
  });
});
