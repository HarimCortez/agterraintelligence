import { IsString, MaxLength, IsObject, IsOptional } from "class-validator";

/**
 * Response DTO for a saved search.
 */
export class SavedSearchDto {
  id!: string;
  name!: string;
  criteria!: Record<string, unknown>;
  createdAt!: Date;
  updatedAt!: Date;
}

/**
 * Response DTO for GET /v1/saved-searches (list of saved searches).
 */
export class GetSavedSearchesResponseDto {
  searches!: SavedSearchDto[];
  count!: number;
}

/**
 * Request DTO for POST /v1/saved-searches.
 */
export class CreateSavedSearchDto {
  @IsString({ message: "name must be a string" })
  @MaxLength(100, { message: "name must be at most 100 characters" })
  name!: string;

  @IsObject({ message: "criteria must be an object" })
  criteria!: Record<string, unknown>;
}

/**
 * Request DTO for PATCH /v1/saved-searches/:id.
 * Both fields are optional, but at least one must be provided.
 */
export class UpdateSavedSearchDto {
  @IsOptional()
  @IsString({ message: "name must be a string" })
  @MaxLength(100, { message: "name must be at most 100 characters" })
  name?: string;

  @IsOptional()
  @IsObject({ message: "criteria must be an object" })
  criteria?: Record<string, unknown>;
}
