import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseUUIDPipe,
  HttpCode,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../identity-access/investor/jwt-auth.guard";
import { CurrentAccountContext } from "../common/account-context/current-account-context.decorator";
import { AccountContext } from "../common/account-context/account-context";
import { SavedSearchesService } from "./saved-searches.service";
import {
  GetSavedSearchesResponseDto,
  SavedSearchDto,
  CreateSavedSearchDto,
  UpdateSavedSearchDto,
} from "./dto/saved-search.dto";

/**
 * Saved Searches API — investor-plane endpoints for managing saved search criteria.
 * All endpoints require JWT authentication (JwtAuthGuard).
 */
@Controller("saved-searches")
@UseGuards(JwtAuthGuard)
export class SavedSearchesController {
  constructor(private readonly savedSearchesService: SavedSearchesService) {}

  /**
   * GET /v1/saved-searches
   * List all saved searches for the current user.
   * Returns: { searches: [...], count: number }
   */
  @Get()
  async getSavedSearches(
    @CurrentAccountContext() ctx: AccountContext,
  ): Promise<GetSavedSearchesResponseDto> {
    return this.savedSearchesService.listForAccount(ctx);
  }

  /**
   * POST /v1/saved-searches
   * Create a new saved search for the current user.
   * Body: { name: string, criteria: object }
   * name: non-empty, max 100 chars
   * criteria: free-form object (same shape as GET /v1/properties query params)
   * Returns: the created SavedSearchDto
   */
  @Post()
  async createSavedSearch(
    @CurrentAccountContext() ctx: AccountContext,
    @Body() input: CreateSavedSearchDto,
  ): Promise<SavedSearchDto> {
    return this.savedSearchesService.createForAccount(ctx, input);
  }

  /**
   * PATCH /v1/saved-searches/:id
   * Update a saved search (name and/or criteria, at least one required).
   * Ownership check: 404 if not found or doesn't belong to current user.
   * Returns: the updated SavedSearchDto
   */
  @Patch(":id")
  async updateSavedSearch(
    @CurrentAccountContext() ctx: AccountContext,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: UpdateSavedSearchDto,
  ): Promise<SavedSearchDto> {
    return this.savedSearchesService.updateForAccount(ctx, id, input);
  }

  /**
   * DELETE /v1/saved-searches/:id
   * Delete a saved search by ID.
   * Ownership check: 404 if not found or doesn't belong to current user.
   * 204 if successfully deleted.
   */
  @Delete(":id")
  @HttpCode(204)
  async deleteSavedSearch(
    @CurrentAccountContext() ctx: AccountContext,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.savedSearchesService.deleteForAccount(ctx, id);
  }
}
