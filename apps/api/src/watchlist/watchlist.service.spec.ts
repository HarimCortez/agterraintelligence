import { Test } from "@nestjs/testing";
import { ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { PropertiesService } from "../properties/properties.service";
import { AccountContext } from "../common/account-context/account-context";
import { WatchlistService } from "./watchlist.service";

const CTX = AccountContext.forUser({ id: "user-1", orgId: null });

describe("WatchlistService", () => {
  let service: WatchlistService;

  const prismaMock = {
    watchlistItem: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
  };
  const propertiesServiceMock = { getPropertyById: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        WatchlistService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: PropertiesService, useValue: propertiesServiceMock },
      ],
    }).compile();
    service = moduleRef.get(WatchlistService);

    propertiesServiceMock.getPropertyById.mockResolvedValue({
      id: "prop-1",
      opportunityScore: null,
      valuation: null,
      riskFlags: [],
    });
    prismaMock.watchlistItem.upsert.mockResolvedValue({ id: "item-1", propertyId: "prop-1", createdAt: new Date() });
  });

  describe("addToWatchlist", () => {
    it("allows adding when the account is under its tier's limit", async () => {
      prismaMock.watchlistItem.findUnique.mockResolvedValue(null);
      prismaMock.watchlistItem.count.mockResolvedValue(4); // free limit is 5

      await service.addToWatchlist(CTX, "prop-1", "free");

      expect(prismaMock.watchlistItem.upsert).toHaveBeenCalledTimes(1);
    });

    it("throws ForbiddenException when a free-tier account is already at its limit (5)", async () => {
      prismaMock.watchlistItem.findUnique.mockResolvedValue(null);
      prismaMock.watchlistItem.count.mockResolvedValue(5);

      await expect(service.addToWatchlist(CTX, "prop-1", "free")).rejects.toThrow(ForbiddenException);
      expect(prismaMock.watchlistItem.upsert).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when a basic-tier account is already at its limit (25)", async () => {
      prismaMock.watchlistItem.findUnique.mockResolvedValue(null);
      prismaMock.watchlistItem.count.mockResolvedValue(25);

      await expect(service.addToWatchlist(CTX, "prop-1", "basic_subscriber")).rejects.toThrow(ForbiddenException);
    });

    it("never limits investor_subscriber and above, regardless of current count", async () => {
      prismaMock.watchlistItem.findUnique.mockResolvedValue(null);
      prismaMock.watchlistItem.count.mockResolvedValue(9_999);

      await service.addToWatchlist(CTX, "prop-1", "investor_subscriber");

      expect(prismaMock.watchlistItem.upsert).toHaveBeenCalledTimes(1);
      expect(prismaMock.watchlistItem.count).not.toHaveBeenCalled();
    });

    it("re-adding an already-watched property never counts against the limit, even when already at the cap", async () => {
      prismaMock.watchlistItem.findUnique.mockResolvedValue({ id: "existing-item", userId: "user-1", propertyId: "prop-1" });

      await service.addToWatchlist(CTX, "prop-1", "free");

      expect(prismaMock.watchlistItem.count).not.toHaveBeenCalled();
      expect(prismaMock.watchlistItem.upsert).toHaveBeenCalledTimes(1);
    });
  });

  describe("removeFromWatchlist", () => {
    it("always allows removal regardless of tier or count", async () => {
      prismaMock.watchlistItem.deleteMany.mockResolvedValue({ count: 1 });

      await service.removeFromWatchlist(CTX, "prop-1");

      expect(prismaMock.watchlistItem.deleteMany).toHaveBeenCalledWith({
        where: { userId: "user-1", propertyId: "prop-1" },
      });
    });
  });
});
