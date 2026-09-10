import { Test } from "@nestjs/testing";
import { PrismaService } from "../prisma/prisma.service";
import { AccountContextService } from "./account-context.service";

describe("AccountContextService", () => {
  let service: AccountContextService;
  const findUniqueOrThrow = jest.fn();
  const prismaMock = { user: { findUniqueOrThrow } };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [AccountContextService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = moduleRef.get(AccountContextService);
  });

  it("builds an AccountContext from a looked-up user's id/orgId, selecting only those two columns", async () => {
    findUniqueOrThrow.mockResolvedValue({ id: "user-1", orgId: null });

    const ctx = await service.forUserId("user-1");

    expect(findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: { id: true, orgId: true },
    });
    expect(ctx.scopeId).toBe("user-1");
    expect(ctx.isOrgScoped).toBe(false);
  });

  it("propagates a not-found error rather than silently building a bogus context", async () => {
    findUniqueOrThrow.mockRejectedValue(new Error("No User found"));
    await expect(service.forUserId("missing")).rejects.toThrow("No User found");
  });
});
