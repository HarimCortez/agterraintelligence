import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { PropertiesService } from "../properties/properties.service";
import { toPropertyDetail } from "../properties/properties.serializers";
import { AccountContext } from "../common/account-context/account-context";
import { WatchlistItemDto, GetWatchlistResponseDto } from "./dto/watchlist.dto";

/**
 * Service for watchlist operations (add, list, remove).
 * Uses AccountContext to scope queries to the current user's data.
 */
@Injectable()
export class WatchlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly propertiesService: PropertiesService,
  ) {}

  /**
   * List the current user's watchlist items with full property details.
   */
  async listForAccount(ctx: AccountContext): Promise<GetWatchlistResponseDto> {
    // Fetch watchlist items for the current user (scoped by scopeId which is userId in MVP)
    const items = await this.prisma.watchlistItem.findMany({
      where: { userId: ctx.scopeId },
      include: { property: true },
      orderBy: { createdAt: "desc" },
    });

    // For each property, fetch full detail shape (with scores, valuations, risk flags)
    const itemsWithDetails: WatchlistItemDto[] = [];
    for (const item of items) {
      try {
        const propertyDetail = await this.propertiesService.getPropertyById(item.propertyId);
        itemsWithDetails.push({
          id: item.id,
          propertyId: item.propertyId,
          property: toPropertyDetail(propertyDetail),
          createdAt: item.createdAt,
        });
      } catch {
        // If property is deleted or inaccessible, skip it (or log it)
        // In a real scenario, cascade delete should prevent this
        console.warn(`Watchlist item ${item.id} references deleted property ${item.propertyId}`);
      }
    }

    return {
      items: itemsWithDetails,
      count: itemsWithDetails.length,
    };
  }

  /**
   * Add a property to the current user's watchlist.
   * Idempotent: if already watched, return success (200) rather than 409.
   * Throws NotFoundException if property doesn't exist.
   */
  async addToWatchlist(ctx: AccountContext, propertyId: string): Promise<WatchlistItemDto> {
    // Verify property exists
    await this.propertiesService.getPropertyById(propertyId);

    // Upsert watchlist item (create if not exists, update createdAt if does exist)
    // Since we have a unique constraint on (userId, propertyId), we can use upsert
    const item = await this.prisma.watchlistItem.upsert({
      where: {
        userId_propertyId: {
          userId: ctx.scopeId,
          propertyId: propertyId,
        },
      },
      update: {},
      create: {
        userId: ctx.scopeId,
        propertyId: propertyId,
      },
    });

    // Fetch full property detail
    const propertyDetail = await this.propertiesService.getPropertyById(propertyId);

    return {
      id: item.id,
      propertyId: item.propertyId,
      property: toPropertyDetail(propertyDetail),
      createdAt: item.createdAt,
    };
  }

  /**
   * Remove a property from the current user's watchlist.
   * Idempotent: 204 whether or not it was actually watched.
   * Scoped to current user (scopeId) so no permission check needed.
   */
  async removeFromWatchlist(ctx: AccountContext, propertyId: string): Promise<void> {
    // Delete the watchlist item for this user and property
    // If it doesn't exist, deleteMany returns 0 but doesn't error
    await this.prisma.watchlistItem.deleteMany({
      where: {
        userId: ctx.scopeId,
        propertyId: propertyId,
      },
    });
  }
}
