import { IngestionRunStatus } from "@agterra/db";

export interface IngestionRunRowDto {
  id: string;
  source: string;
  status: IngestionRunStatus;
  startedAt: Date;
  finishedAt: Date | null;
  propertiesChecked: number;
  flagsCreated: number;
  errorMessage: string | null;
}

export interface ListIngestionRunsResponseDto {
  results: IngestionRunRowDto[];
  total: number;
  limit: number;
  offset: number;
}

export interface TriggerIngestionResponseDto {
  id: string;
  status: IngestionRunStatus;
  propertiesChecked: number;
  flagsCreated: number;
  errorMessage: string | null;
}
