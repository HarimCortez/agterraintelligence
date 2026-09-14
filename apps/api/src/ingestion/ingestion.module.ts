import { Module } from "@nestjs/common";
import { FemaFloodZoneClient } from "./fema-flood-zone-client";
import { FemaFloodZoneIngestionService } from "./fema-flood-zone-ingestion.service";
import { FlParcelClient } from "./fl-parcel-client";
import { FlParcelCadastralIngestionService } from "./fl-parcel-cadastral-ingestion.service";
import { UsdaSoilClient } from "./usda-soil-client";
import { UsdaSoilIngestionService } from "./usda-soil-ingestion.service";

/**
 * Real external-data ingestion module. Three sources: FEMA flood zones
 * (see `FemaFloodZoneIngestionService`'s doc comment), the FL DOR parcel
 * cadastral sweep (see `FlParcelCadastralIngestionService`'s doc comment),
 * and USDA NRCS soil data (see `UsdaSoilIngestionService`'s doc comment).
 * Exports all three ingestion services so `AdminIngestionModule` can
 * trigger runs without this module owning any admin-facing HTTP surface
 * itself — same separation `MonetizationModule`/`AdminReportFulfillmentModule`
 * use for `ReportGenerationService`.
 */
@Module({
  providers: [
    FemaFloodZoneClient,
    FemaFloodZoneIngestionService,
    FlParcelClient,
    FlParcelCadastralIngestionService,
    UsdaSoilClient,
    UsdaSoilIngestionService,
  ],
  exports: [FemaFloodZoneIngestionService, FlParcelCadastralIngestionService, UsdaSoilIngestionService],
})
export class IngestionModule {}
