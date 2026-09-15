import { Module } from "@nestjs/common";
import { AsianLonghornedBeetleQuarantineClient } from "./asian-longhorned-beetle-quarantine-client";
import { AsianLonghornedBeetleQuarantineIngestionService } from "./asian-longhorned-beetle-quarantine-ingestion.service";
import { CitrusBlackSpotClient } from "./citrus-black-spot-client";
import { CitrusBlackSpotIngestionService } from "./citrus-black-spot-ingestion.service";
import { CitrusQuarantineClient } from "./citrus-quarantine-client";
import { CitrusQuarantineIngestionService } from "./citrus-quarantine-ingestion.service";
import { CroplandCoverIngestionService } from "./cropland-cover-ingestion.service";
import { CroplandDataClient } from "./cropland-data-client";
import { EmeraldAshBorerClient } from "./emerald-ash-borer-client";
import { EmeraldAshBorerIngestionService } from "./emerald-ash-borer-ingestion.service";
import { ErsCountyEconomicClient } from "./ers-county-economic-client";
import { ErsCountyEconomicIngestionService } from "./ers-county-economic-ingestion.service";
import { FemaFloodZoneClient } from "./fema-flood-zone-client";
import { FemaFloodZoneIngestionService } from "./fema-flood-zone-ingestion.service";
import { FiaTimberClient } from "./fia-timber-client";
import { FiaTimberIngestionService } from "./fia-timber-ingestion.service";
import { FireAntQuarantineClient } from "./fire-ant-quarantine-client";
import { FireAntQuarantineIngestionService } from "./fire-ant-quarantine-ingestion.service";
import { FlParcelClient } from "./fl-parcel-client";
import { FlParcelCadastralIngestionService } from "./fl-parcel-cadastral-ingestion.service";
import { HpaiDairyCattleClient } from "./hpai-dairy-cattle-client";
import { HpaiDairyCattleIngestionService } from "./hpai-dairy-cattle-ingestion.service";
import { NassAgCensusClient } from "./nass-ag-census-client";
import { NassAgCensusIngestionService } from "./nass-ag-census-ingestion.service";
import { RmaCauseOfLossClient } from "./rma-cause-of-loss-client";
import { RmaCauseOfLossIngestionService } from "./rma-cause-of-loss-ingestion.service";
import { SpongyMothQuarantineClient } from "./spongy-moth-quarantine-client";
import { SpongyMothQuarantineIngestionService } from "./spongy-moth-quarantine-ingestion.service";
import { SuddenOakDeathQuarantineClient } from "./sudden-oak-death-quarantine-client";
import { SuddenOakDeathQuarantineIngestionService } from "./sudden-oak-death-quarantine-ingestion.service";
import { UsdaForestHealthClient } from "./usda-forest-health-client";
import { UsdaForestHealthIngestionService } from "./usda-forest-health-ingestion.service";
import { UsdaRdEligibilityClient } from "./usda-rd-eligibility-client";
import { UsdaRdEligibilityIngestionService } from "./usda-rd-eligibility-ingestion.service";
import { UsdaSoilClient } from "./usda-soil-client";
import { UsdaSoilIngestionService } from "./usda-soil-ingestion.service";
import { WetlandsClient } from "./wetlands-client";
import { WetlandsIngestionService } from "./wetlands-ingestion.service";

/**
 * Real external-data ingestion module. Nineteen sources: FEMA flood zones
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
 * the USDA ERS (Economic Research Service) County-level Data Sets
 * (see `ErsCountyEconomicIngestionService`'s doc comment — the first
 * source that isn't physical/agricultural: county population growth and
 * local economic conditions as direct land-investment context), and the
 * USDA Rural Development Eligibility MapServer (see
 * `UsdaRdEligibilityIngestionService`'s doc comment — real-estate
 * financing context: which RD loan programs, if any, a property is
 * ineligible for at its own coordinates), the USDA Forest Service
 * Insect & Disease Survey (see `UsdaForestHealthIngestionService`'s doc
 * comment — real aerial-detected forest pest/disease damage within ~10
 * miles of timber properties, a radius query rather than the exact
 * point-intersects pattern every other spatial job here uses), and the
 * USDA APHIS Imported Fire Ant quarantine (see
 * `FireAntQuarantineIngestionService`'s doc comment — same underlying
 * federal quarantine dataset as the two citrus jobs, a different real
 * `Quarantine_Program` value, swept across every property rather than one
 * land use), the USDA APHIS Spongy Moth quarantine (see
 * `SpongyMothQuarantineIngestionService`'s doc comment — the largest real
 * program on that same quarantine layer, 620 county-level records
 * nationwide, scoped to timber properties), and the USDA APHIS Asian
 * Longhorned Beetle quarantine (see
 * `AsianLonghornedBeetleQuarantineIngestionService`'s doc comment — the
 * first of the quarantine jobs to filter `Quarantine_Status`
 * server-side, avoiding a real latent bug where a rescinded/lifted
 * quarantine could otherwise be surfaced as still active), and the USDA
 * APHIS Phytophthora ramorum (Sudden Oak Death) quarantine (see
 * `SuddenOakDeathQuarantineIngestionService`'s doc comment — real West
 * Coast forest pathogen coverage, 17 county-level records, scoped to
 * timber properties), the USDA APHIS Emerald Ash Borer known-infested
 * counties dataset (see `EmeraldAshBorerIngestionService`'s doc comment —
 * a different APHIS FeatureServer than every quarantine job above,
 * discovered via APHIS's public ArcGIS service catalog; a historical
 * "known infested" record rather than an active regulatory status, since
 * the federal EAB quarantine program was rescinded in 2021), and the
 * USDA APHIS Highly Pathogenic Avian Influenza (H5N1) in dairy cattle
 * dataset (see `HpaiDairyCattleIngestionService`'s doc comment — the
 * first state-level, not county-level, source in this module, and the
 * first covering livestock disease rather than a plant/forest pest,
 * scoped to `pasture` properties).
 * Exports all nineteen ingestion services so `AdminIngestionModule` can
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
    UsdaRdEligibilityClient,
    UsdaRdEligibilityIngestionService,
    UsdaForestHealthClient,
    UsdaForestHealthIngestionService,
    FireAntQuarantineClient,
    FireAntQuarantineIngestionService,
    SpongyMothQuarantineClient,
    SpongyMothQuarantineIngestionService,
    AsianLonghornedBeetleQuarantineClient,
    AsianLonghornedBeetleQuarantineIngestionService,
    SuddenOakDeathQuarantineClient,
    SuddenOakDeathQuarantineIngestionService,
    EmeraldAshBorerClient,
    EmeraldAshBorerIngestionService,
    HpaiDairyCattleClient,
    HpaiDairyCattleIngestionService,
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
    UsdaRdEligibilityIngestionService,
    UsdaForestHealthIngestionService,
    FireAntQuarantineIngestionService,
    SpongyMothQuarantineIngestionService,
    AsianLonghornedBeetleQuarantineIngestionService,
    SuddenOakDeathQuarantineIngestionService,
    EmeraldAshBorerIngestionService,
    HpaiDairyCattleIngestionService,
  ],
})
export class IngestionModule {}
