import { Module } from "@nestjs/common";
import { CitrusBlackSpotClient } from "./citrus-black-spot-client";
import { CitrusBlackSpotIngestionService } from "./citrus-black-spot-ingestion.service";
import { CitrusQuarantineClient } from "./citrus-quarantine-client";
import { CitrusQuarantineIngestionService } from "./citrus-quarantine-ingestion.service";
import { CroplandCoverIngestionService } from "./cropland-cover-ingestion.service";
import { CroplandDataClient } from "./cropland-data-client";
import { ErsCountyEconomicClient } from "./ers-county-economic-client";
import { ErsCountyEconomicIngestionService } from "./ers-county-economic-ingestion.service";
import { FemaFloodZoneClient } from "./fema-flood-zone-client";
import { FemaFloodZoneIngestionService } from "./fema-flood-zone-ingestion.service";
import { FiaTimberClient } from "./fia-timber-client";
import { FiaTimberIngestionService } from "./fia-timber-ingestion.service";
import { FlParcelClient } from "./fl-parcel-client";
import { FlParcelCadastralIngestionService } from "./fl-parcel-cadastral-ingestion.service";
import { NassAgCensusClient } from "./nass-ag-census-client";
import { NassAgCensusIngestionService } from "./nass-ag-census-ingestion.service";
import { RmaCauseOfLossClient } from "./rma-cause-of-loss-client";
import { RmaCauseOfLossIngestionService } from "./rma-cause-of-loss-ingestion.service";
import { UsdaSoilClient } from "./usda-soil-client";
import { UsdaSoilIngestionService } from "./usda-soil-ingestion.service";
import { WetlandsClient } from "./wetlands-client";
import { WetlandsIngestionService } from "./wetlands-ingestion.service";

/**
 * Real external-data ingestion module. Eleven sources: FEMA flood zones
 * (see `FemaFloodZoneIngestionService`'s doc comment), the FL DOR parcel
 * cadastral sweep (see `FlParcelCadastralIngestionService`'s doc comment),
 * USDA NRCS soil data (see `UsdaSoilIngestionService`'s doc comment),
 * USFWS wetlands data (see `WetlandsIngestionService`'s doc comment),
 * USDA APHIS Citrus Greening (HLB) quarantine data (see
 * `CitrusQuarantineIngestionService`'s doc comment), USDA APHIS Citrus
 * Black Spot quarantine data (see `CitrusBlackSpotIngestionService`'s
 * doc comment — a separate program from HLB, on the same underlying
 * federal quarantine dataset but requiring a genuine per-point spatial
 * query rather than a per-county lookup), the USDA NASS Cropland Data
 * Layer (see `CroplandCoverIngestionService`'s doc comment), the USDA
 * NASS Census of Agriculture (see `NassAgCensusIngestionService`'s doc
 * comment — sourced via a free bulk file rather than the live Quick
 * Stats API, which requires a registered key), the USDA Forest Service
 * Forest Inventory and Analysis program (see
 * `FiaTimberIngestionService`'s doc comment — a real, live, keyless JSON
 * API, unlike the NASS Census of Agriculture job it otherwise resembles),
 * the USDA Risk Management Agency's federal crop insurance Cause of
 * Loss data (see `RmaCauseOfLossIngestionService`'s doc comment — like
 * the FIA job, a real keyless bulk file with no gated API alternative),
 * and the USDA ERS (Economic Research Service) County-level Data Sets
 * (see `ErsCountyEconomicIngestionService`'s doc comment — the first
 * source that isn't physical/agricultural: county population growth and
 * local economic conditions as direct land-investment context).
 * Exports all eleven ingestion services so `AdminIngestionModule` can
 * trigger runs without this module owning any admin-facing HTTP surface
 * itself — same separation
 * `MonetizationModule`/`AdminReportFulfillmentModule` use for
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
    CitrusBlackSpotClient,
    CitrusBlackSpotIngestionService,
    CroplandDataClient,
    CroplandCoverIngestionService,
    NassAgCensusClient,
    NassAgCensusIngestionService,
    FiaTimberClient,
    FiaTimberIngestionService,
    RmaCauseOfLossClient,
    RmaCauseOfLossIngestionService,
    ErsCountyEconomicClient,
    ErsCountyEconomicIngestionService,
  ],
  exports: [
    FemaFloodZoneIngestionService,
    FlParcelCadastralIngestionService,
    UsdaSoilIngestionService,
    WetlandsIngestionService,
    CitrusQuarantineIngestionService,
    CitrusBlackSpotIngestionService,
    CroplandCoverIngestionService,
    NassAgCensusIngestionService,
    FiaTimberIngestionService,
    RmaCauseOfLossIngestionService,
    ErsCountyEconomicIngestionService,
  ],
})
export class IngestionModule {}
