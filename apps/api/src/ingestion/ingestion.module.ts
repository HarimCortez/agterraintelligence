import { Module } from "@nestjs/common";
import { CitrusQuarantineClient } from "./citrus-quarantine-client";
import { CitrusQuarantineIngestionService } from "./citrus-quarantine-ingestion.service";
import { FemaFloodZoneClient } from "./fema-flood-zone-client";
import { FemaFloodZoneIngestionService } from "./fema-flood-zone-ingestion.service";
import { FlParcelClient } from "./fl-parcel-client";
import { FlParcelCadastralIngestionService } from "./fl-parcel-cadastral-ingestion.service";
import { UsdaSoilClient } from "./usda-soil-client";
import { UsdaSoilIngestionService } from "./usda-soil-ingestion.service";
import { WetlandsClient } from "./wetlands-client";
import { WetlandsIngestionService } from "./wetlands-ingestion.service";

/**
 * Real external-data ingestion module. Five sources: FEMA flood zones
 * (see `FemaFloodZoneIngestionService`'s doc comment), the FL DOR parcel
 * cadastral sweep (see `FlParcelCadastralIngestionService`'s doc comment),
 * USDA NRCS soil data (see `UsdaSoilIngestionService`'s doc comment),
 * USFWS wetlands data (see `WetlandsIngestionService`'s doc comment), and
 * USDA APHIS citrus quarantine data (see
 * `CitrusQuarantineIngestionService`'s doc comment). Exports all five
 * ingestion services so `AdminIngestionModule` can trigger runs without
 * this module owning any admin-facing HTTP surface itself — same
 * separation `MonetizationModule`/`AdminReportFulfillmentModule` use for
 * `ReportGenerationService`.
 */
@Module({
  providers: [
    FemaFloodZoneClient,
    FemaFloodZoneIngestionService,
    FlParcelClient,
    FlParcelCadastralIngestionService,
    UsdaSoilClient,
    UsdaSoilIngestionService,
    WetlandsClient,
    WetlandsIngestionService,
    CitrusQuarantineClient,
    CitrusQuarantineIngestionService,
  ],
  exports: [
    FemaFloodZoneIngestionService,
    FlParcelCadastralIngestionService,
    UsdaSoilIngestionService,
    WetlandsIngestionService,
    CitrusQuarantineIngestionService,
  ],
})
export class IngestionModule {}
