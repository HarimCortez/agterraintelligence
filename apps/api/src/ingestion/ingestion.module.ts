import { Module } from "@nestjs/common";
import { FemaFloodZoneClient } from "./fema-flood-zone-client";
import { FemaFloodZoneIngestionService } from "./fema-flood-zone-ingestion.service";

/**
 * Real external-data ingestion module. Currently one source (FEMA flood
 * zones — see `FemaFloodZoneIngestionService`'s doc comment). Exports
 * both providers so `AdminIngestionModule` can trigger runs without this
 * module owning any admin-facing HTTP surface itself — same separation
 * `MonetizationModule`/`AdminReportFulfillmentModule` use for
 * `ReportGenerationService`.
 */
@Module({
  providers: [FemaFloodZoneClient, FemaFloodZoneIngestionService],
  exports: [FemaFloodZoneIngestionService],
})
export class IngestionModule {}
