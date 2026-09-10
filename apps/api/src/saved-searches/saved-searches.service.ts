import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@agterra/db";
import { PrismaService } from "../common/prisma/prisma.service";
import { AccountContext } from "../common/account-context/account-context";
import {
  SavedSearchDto,
  GetSavedSearchesResponseDto,
  CreateSavedSearchDto,
  UpdateSavedSearchDto,
} from "./dto/saved-search.dto";

/**
 * Service for saved search operations (list, create, update, delete).
 * Uses AccountContext to scope queries to the current user's data.
 */
@Injectable()
export class SavedSearchesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List all saved searches for the current user.
   */
  async listForAccount(ctx: AccountContext): Promise<GetSavedSearchesResponseDto> {
    const searches = await this.prisma.savedSearch.findMany({
      where: { userId: ctx.scopeId },
      orderBy: { createdAt: "desc" },
    });

    return {
      searches: searches.map(this.toDto),
      count: searches.length,
    };
  }

  /**
   * Create a new saved search for the current user.
   * Validates name (non-empty, max 100 chars) and criteria (must be an object).
   */
  async createForAccount(
    ctx: AccountContext,
    input: CreateSavedSearchDto,
  ): Promise<SavedSearchDto> {
    // Validate name
    if (!input.name || typeof input.name !== "string" || input.name.trim().length === 0) {
      throw new BadRequestException("name must be a non-empty string");
    }
    if (input.name.length > 100) {
      throw new BadRequestException("name must be at most 100 characters");
    }

    // Validate criteria (must be an object)
    if (!input.criteria || typeof input.criteria !== "object" || Array.isArray(input.criteria)) {
      throw new BadRequestException("criteria must be a non-empty object");
    }

    const search = await this.prisma.savedSearch.create({
      data: {
        userId: ctx.scopeId,
        name: input.name.trim(),
        criteria: input.criteria as Prisma.InputJsonValue,
      },
    });

    return this.toDto(search);
  }

  /**
   * Update a saved search by ID (owned by current user).
   * Both name and criteria are optional, but at least one must be provided.
   * Throws 404 if not found or doesn't belong to current user (never distinguish).
   */
  async updateForAccount(
    ctx: AccountContext,
    id: string,
    input: UpdateSavedSearchDto,
  ): Promise<SavedSearchDto> {
    // Check that at least one field is provided
    if (input.name === undefined && input.criteria === undefined) {
      throw new BadRequestException("At least one of name or criteria must be provided");
    }

    // Validate name if provided
    if (input.name !== undefined) {
      if (!input.name || typeof input.name !== "string" || input.name.trim().length === 0) {
        throw new BadRequestException("name must be a non-empty string");
      }
      if (input.name.length > 100) {
        throw new BadRequestException("name must be at most 100 characters");
      }
    }

    // Validate criteria if provided
    if (input.criteria !== undefined) {
      if (!input.criteria || typeof input.criteria !== "object" || Array.isArray(input.criteria)) {
        throw new BadRequestException("criteria must be a non-empty object");
      }
    }

    const updateData: Record<string, unknown> = {};
    if (input.name !== undefined) {
      updateData.name = input.name.trim();
    }
    if (input.criteria !== undefined) {
      updateData.criteria = input.criteria as Prisma.InputJsonValue;
    }

    // Scope the mutation itself to (id, userId): SavedSearch has no
    // compound unique constraint on (id, userId), so the typed `update()`
    // `where` can't express this — it only accepts unique fields (just
    // `id` here). `updateMany()` accepts an arbitrary filter, so it is
    // structurally impossible to affect a row that isn't owned by the
    // caller. `count === 0` means "not found or not yours" — both map to
    // the same 404, never distinguished.
    const { count } = await this.prisma.savedSearch.updateMany({
      where: { id, userId: ctx.scopeId },
      data: updateData,
    });

    if (count === 0) {
      throw new NotFoundException(`SavedSearch with id ${id} not found`);
    }

    // Ownership was just established by the count check above, so an
    // unscoped read here is safe and only used to build the response DTO.
    const search = await this.prisma.savedSearch.findUnique({ where: { id } });
    if (!search) {
      throw new NotFoundException(`SavedSearch with id ${id} not found`);
    }

    return this.toDto(search);
  }

  /**
   * Delete a saved search by ID (owned by current user).
   * 404 if not found or doesn't belong to current user (never distinguish).
   */
  async deleteForAccount(ctx: AccountContext, id: string): Promise<void> {
    // Scope the mutation itself to (id, userId) — same principle as
    // updateForAccount above — rather than checking ownership in a
    // separate read before the delete. Removes any TOCTOU window and
    // makes it structurally impossible to delete a row that isn't
    // owned by the caller.
    const { count } = await this.prisma.savedSearch.deleteMany({
      where: { id, userId: ctx.scopeId },
    });

    if (count === 0) {
      // Return 404 in both cases: doesn't exist, or exists but isn't mine
      throw new NotFoundException(`SavedSearch with id ${id} not found`);
    }
  }

  /**
   * Convert Prisma SavedSearch model to DTO.
   */
  private toDto(search: { id: string; name: string; criteria: unknown; createdAt: Date; updatedAt: Date }): SavedSearchDto {
    return {
      id: search.id,
      name: search.name,
      criteria: (search.criteria || {}) as Record<string, unknown>,
      createdAt: search.createdAt,
      updatedAt: search.updatedAt,
    };
  }
}
