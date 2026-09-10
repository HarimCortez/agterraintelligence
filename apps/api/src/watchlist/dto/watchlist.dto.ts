import { PropertyDetailDto } from "../../properties/dto/property-result.dto";

/**
 * Response DTO for a watchlist item.
 * Includes the full property detail shape (with opportunity score, valuation, risk flags).
 */
export class WatchlistItemDto {
  id!: string;
  propertyId!: string;
  property!: PropertyDetailDto;
  createdAt!: Date;
}

/**
 * Response DTO for GET /v1/watchlist (list of watchlist items).
 */
export class GetWatchlistResponseDto {
  items!: WatchlistItemDto[];
  count!: number;
}
