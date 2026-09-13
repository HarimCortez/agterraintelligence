import { Module } from "@nestjs/common";
import { FemaFloodZoneClient } from "./fema-flood-zone-client";
import { FemaFloodZoneIngestionService } from "./fema-flood-zone-ingestion.service";
import { FlParcelClient } from "./fl-parcel-client";
import { FlParcelCadastralIngestionService } from "./fl-parcel-cadastral-ingestion.service";

/**
 * Real external-data ingestion module. Two sources: FEMA flood zones (see
 * `FemaFloodZoneIngestionService`'s doc comment) and the FL DOR parcel
 * cadastral sweep (see `FlParcelCadastralIngestionService`'s doc comment).
 * Exports both ingestion services so `AdminIngestionModule` can trigger
 * runs without this module owning any admin-facing HTTP surface itself —
 * same separation `MonetizationModule`/`AdminReportFulfillmentModule` use
 * for `ReportGenerationService`.
 */
@Module({
  providers: [FemaFloodZoneClient, FemaFloodZoneIngestionService, FlParcelClient, FlParcelCadastralIngestionService],
  exports: [FemaFloodZoneIngestionService, FlParcelCadastralIngestionService],
})
export class IngestionModule {}
