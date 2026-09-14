import { Test } from "@nestjs/testing";
import { ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { AccountContext } from "../common/account-context/account-context";
import { SavedSearchesService } from "./saved-searches.service";

const CTX = AccountContext.forUser({ id: "user-1", orgId: null });
const VALID_INPUT = { name: "My search", criteria: { minScore: 80 } };

describe("SavedSearchesService", () => {
  let service: SavedSearchesService;

  const prismaMock = {
    savedSearch: { findMany: jest.fn(), count: jest.fn(), create: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn(), deleteMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [SavedSearchesService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = moduleRef.get(SavedSearchesService);

    prismaMock.savedSearch.create.mockResolvedValue({
      id: "search-1",
      name: VALID_INPUT.name,
      criteria: VALID_INPUT.criteria,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  describe("createForAccount", () => {
    it("allows creating when the account is under its tier's limit", async () => {
      prismaMock.savedSearch.count.mockResolvedValue(2); // free limit is 3

      await service.createForAccount(CTX, VALID_INPUT, "free");

      expect(prismaMock.savedSearch.create).toHaveBeenCalledTimes(1);
    });

    it("throws ForbiddenException when a free-tier account is already at its limit (3)", async () => {
      prismaMock.savedSearch.count.mockResolvedValue(3);

      await expect(service.createForAccount(CTX, VALID_INPUT, "free")).rejects.toThrow(ForbiddenException);
      expect(prismaMock.savedSearch.create).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when a basic-tier account is already at its limit (15)", async () => {
      prismaMock.savedSearch.count.mockResolvedValue(15);

      await expect(service.createForAccount(CTX, VALID_INPUT, "basic_subscriber")).rejects.toThrow(ForbiddenException);
    });

    it("never limits investor_subscriber and above, regardless of current count", async () => {
      prismaMock.savedSearch.count.mockResolvedValue(9_999);

      await service.createForAccount(CTX, VALID_INPUT, "investor_subscriber");

      expect(prismaMock.savedSearch.create).toHaveBeenCalledTimes(1);
      expect(prismaMock.savedSearch.count).not.toHaveBeenCalled();
    });

    it("still validates name/criteria before checking the limit", async () => {
      await expect(service.createForAccount(CTX, { name: "", criteria: {} }, "free")).rejects.toThrow(
        "name must be a non-empty string",
      );
      expect(prismaMock.savedSearch.count).not.toHaveBeenCalled();
    });
  });
});
