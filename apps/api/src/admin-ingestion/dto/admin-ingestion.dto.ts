import { IngestionRunStatus } from "@agterra/db";

export interface IngestionRunRowDto {
  id: string;
  source: string;
  status: IngestionRunStatus;
  startedAt: Date;
  finishedAt: Date | null;
  itemsProcessed: number;
  recordsCreated: number;
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
  itemsProcessed: number;
  recordsCreated: number;
  errorMessage: string | null;
}

export interface ParcelRecordRowDto {
  id: string;
  county: string;
  parcelId: string;
  ownerName: string | null;
  siteAddress: string | null;
  siteCity: string | null;
  dorUseCode: string;
  dorUseDescription: string;
  acreage: string;
  justValueCents: number;
  ingestedAt: Date;
}

export interface ListParcelRecordsResponseDto {
  results: ParcelRecordRowDto[];
  total: number;
  limit: number;
  offset: number;
}
