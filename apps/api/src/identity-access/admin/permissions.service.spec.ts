import { Test } from "@nestjs/testing";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PermissionsService } from "./permissions.service";

describe("PermissionsService", () => {
  let service: PermissionsService;
  const findUnique = jest.fn();
  const prismaMock = { rolePermission: { findUnique } };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [PermissionsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = moduleRef.get(PermissionsService);
  });

  it("returns true when the (role, permissionKey) row exists with allowed=true", async () => {
    findUnique.mockResolvedValue({ allowed: true });
    const result = await service.isAllowed("billing_manager", "billing.refund");
    expect(result).toBe(true);
    expect(findUnique).toHaveBeenCalledWith({
      where: { role_permissionKey: { role: "billing_manager", permissionKey: "billing.refund" } },
    });
  });

  it("returns false when the row exists but allowed=false", async () => {
    findUnique.mockResolvedValue({ allowed: false });
    expect(await service.isAllowed("support_agent", "billing.refund")).toBe(false);
  });

  it("fails closed (returns false) when no policy row exists at all — table-driven, deny-by-default", async () => {
    findUnique.mockResolvedValue(null);
    expect(await service.isAllowed("readonly_analyst", "audit_log.read")).toBe(false);
  });
});
