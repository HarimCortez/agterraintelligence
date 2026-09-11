/**
 * Seed script — Discover + Map Workspace first-pass dataset.
 *
 * Populates `properties`, `opportunity_scores`, `property_valuations`, and
 * `property_risk_flags` with ~20 realistic Florida agricultural land
 * listings spread across five counties known for agricultural land
 * (Okeechobee, Highlands, DeSoto, Hardee, Polk), covering the full
 * Opportunity Score band range, all six land-use types, all four data
 * confidence levels, and a mix of positive/negative valuation discounts.
 *
 * Idempotent: deletes existing rows (children cascade from `properties`)
 * before inserting, so `pnpm --filter @agterra/db seed` is safe to re-run.
 *
 * `location` is a PostGIS `geography(Point,4326)` column, which Prisma
 * Client cannot write via its generated model API (see schema.prisma's
 * Unsupported-type note) — property rows are inserted via `$executeRaw`
 * using `ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography`.
 */
import { PrismaClient, Prisma, InternalRole } from "@prisma/client";

const prisma = new PrismaClient();

type ListingStatus = "active" | "pending" | "sold" | "off_market";
type LandUseType =
  | "row_crop"
  | "pasture"
  | "timber"
  | "citrus"
  | "mixed_agricultural"
  | "vacant_agricultural";
type OpportunityBand = "exceptional" | "strong" | "promising" | "watch" | "limited";
type ValuationConfidence = "verified" | "modeled" | "ai_inferred" | "unknown";
type RiskSeverity = "low" | "medium" | "high";

interface RiskFlagSeed {
  riskType: string;
  severity: RiskSeverity;
  description: string;
}

interface PropertySeed {
  parcelId: string;
  county: string;
  address: string;
  lng: number;
  lat: number;
  acreage: number;
  askingPriceCents: number;
  listingStatus: ListingStatus;
  landUseType: LandUseType;
  score: number;
  band: OpportunityBand;
  // Target discount; actual stored discount_pct is recomputed from the
  // rounded estimated_value_cents so the two fields are always consistent.
  targetDiscountPct: number;
  confidence: ValuationConfidence;
  risks?: RiskFlagSeed[];
}

// Real approximate county-seat centroids for FL counties in the ag belt,
// used as the base point for each county's listings (offset per-parcel
// below) — not literally 0,0 / placeholder coordinates.
// Okeechobee: 27.2414, -80.8298 | Highlands (Sebring): 27.4956, -81.4409
// DeSoto (Arcadia): 27.2153, -81.8623 | Hardee (Wauchula): 27.5453, -81.8078
// Polk (Bartow): 27.8981, -81.8331

const PROPERTIES: PropertySeed[] = [
  // --- Okeechobee County ---
  {
    parcelId: "OKEE-2024-0001",
    county: "Okeechobee",
    address: "Kissimmee River Row Crop Tract",
    lng: -80.805,
    lat: 27.261,
    acreage: 340,
    askingPriceCents: 323_000_000,
    listingStatus: "active",
    landUseType: "row_crop",
    score: 92,
    band: "exceptional",
    targetDiscountPct: 15,
    confidence: "verified",
  },
  {
    parcelId: "OKEE-2024-0002",
    county: "Okeechobee",
    address: "Taylor Creek Cattle Ranch",
    lng: -80.86,
    lat: 27.195,
    acreage: 1850,
    askingPriceCents: 777_000_000,
    listingStatus: "pending",
    landUseType: "pasture",
    score: 68,
    band: "watch",
    targetDiscountPct: 5,
    confidence: "modeled",
    risks: [
      {
        riskType: "access_easement",
        severity: "medium",
        description: "Shared ranch-road easement with adjoining parcel; terms not yet verified against county records.",
      },
    ],
  },
  {
    parcelId: "OKEE-2024-0003",
    county: "Okeechobee",
    address: "Lake Okeechobee Vacant Ag Parcel",
    lng: -80.78,
    lat: 27.22,
    acreage: 95,
    askingPriceCents: 36_100_000,
    listingStatus: "active",
    landUseType: "vacant_agricultural",
    score: 45,
    band: "limited",
    targetDiscountPct: -8,
    confidence: "unknown",
    risks: [
      {
        riskType: "flood_zone",
        severity: "high",
        description: "Majority of parcel falls within FEMA Special Flood Hazard Area per preliminary overlay check.",
      },
      {
        riskType: "title_question",
        severity: "medium",
        description: "Chain of title shows an unresolved easement reservation from a 1987 partition deed.",
      },
    ],
  },
  {
    parcelId: "OKEE-2024-0004",
    county: "Okeechobee",
    address: "Buckhead Ridge Mixed Ag Tract",
    lng: -80.92,
    lat: 27.285,
    acreage: 620,
    askingPriceCents: 378_200_000,
    listingStatus: "active",
    landUseType: "mixed_agricultural",
    score: 78,
    band: "promising",
    targetDiscountPct: 12,
    confidence: "ai_inferred",
  },

  // --- Highlands County ---
  {
    parcelId: "HIGH-2024-0001",
    county: "Highlands",
    address: "Sun 'n Lake Citrus Grove",
    lng: -81.47,
    lat: 27.52,
    acreage: 210,
    askingPriceCents: 283_500_000,
    listingStatus: "active",
    landUseType: "citrus",
    score: 90,
    band: "exceptional",
    targetDiscountPct: 18,
    confidence: "verified",
  },
  {
    parcelId: "HIGH-2024-0002",
    county: "Highlands",
    address: "Lake Placid Timber Tract",
    lng: -81.38,
    lat: 27.43,
    acreage: 980,
    askingPriceCents: 313_600_000,
    listingStatus: "active",
    landUseType: "timber",
    score: 71,
    band: "promising",
    targetDiscountPct: 6,
    confidence: "modeled",
    risks: [
      {
        riskType: "boundary_dispute",
        severity: "low",
        description: "Minor discrepancy between fence line and recorded survey on the northeast boundary.",
      },
    ],
  },
  {
    parcelId: "HIGH-2024-0003",
    county: "Highlands",
    address: "Avon Park Pasture Land",
    lng: -81.51,
    lat: 27.56,
    acreage: 450,
    askingPriceCents: 202_500_000,
    listingStatus: "sold",
    landUseType: "pasture",
    score: 60,
    band: "watch",
    targetDiscountPct: -3,
    confidence: "unknown",
  },
  {
    parcelId: "HIGH-2024-0004",
    county: "Highlands",
    address: "Sebring Vacant Ag Parcel",
    lng: -81.42,
    lat: 27.49,
    acreage: 38,
    askingPriceCents: 19_760_000,
    listingStatus: "active",
    landUseType: "vacant_agricultural",
    score: 38,
    band: "limited",
    targetDiscountPct: -15,
    confidence: "ai_inferred",
    risks: [
      {
        riskType: "title_question",
        severity: "high",
        description: "Probate proceeding referenced in most recent deed transfer has no confirmed closing record.",
      },
      {
        riskType: "water_rights_uncertain",
        severity: "medium",
        description: "Consumptive-use permit status for the on-site well could not be confirmed with SFWMD records.",
      },
    ],
  },

  // --- DeSoto County ---
  {
    parcelId: "DESO-2024-0001",
    county: "DeSoto",
    address: "Peace River Row Crop Farm",
    lng: -81.83,
    lat: 27.24,
    acreage: 725,
    askingPriceCents: 638_000_000,
    listingStatus: "active",
    landUseType: "row_crop",
    score: 85,
    band: "strong",
    targetDiscountPct: 10,
    confidence: "verified",
  },
  {
    parcelId: "DESO-2024-0002",
    county: "DeSoto",
    address: "Arcadia Citrus Grove Estate",
    lng: -81.9,
    lat: 27.19,
    acreage: 340,
    askingPriceCents: 482_800_000,
    listingStatus: "active",
    landUseType: "citrus",
    score: 96,
    band: "exceptional",
    targetDiscountPct: 22,
    confidence: "verified",
  },
  {
    parcelId: "DESO-2024-0003",
    county: "DeSoto",
    address: "Nocatee Mixed Ag Ranch",
    lng: -81.81,
    lat: 27.17,
    acreage: 1420,
    askingPriceCents: 695_800_000,
    listingStatus: "pending",
    landUseType: "mixed_agricultural",
    score: 65,
    band: "watch",
    targetDiscountPct: 2,
    confidence: "modeled",
    risks: [
      {
        riskType: "access_easement",
        severity: "low",
        description: "Ingress/egress relies on a recorded but unmapped easement across a neighboring ranch.",
      },
    ],
  },
  {
    parcelId: "DESO-2024-0004",
    county: "DeSoto",
    address: "DeSoto Vacant Ag Tract",
    lng: -81.91,
    lat: 27.25,
    acreage: 55,
    askingPriceCents: 22_550_000,
    listingStatus: "active",
    landUseType: "vacant_agricultural",
    score: 52,
    band: "limited",
    targetDiscountPct: -6,
    confidence: "unknown",
  },

  // --- Hardee County ---
  {
    parcelId: "HARD-2024-0001",
    county: "Hardee",
    address: "Wauchula Row Crop Ground",
    lng: -81.78,
    lat: 27.57,
    acreage: 480,
    askingPriceCents: 393_600_000,
    listingStatus: "active",
    landUseType: "row_crop",
    score: 82,
    band: "strong",
    targetDiscountPct: 9,
    confidence: "verified",
  },
  {
    parcelId: "HARD-2024-0002",
    county: "Hardee",
    address: "Zolfo Springs Cattle Ranch",
    lng: -81.84,
    lat: 27.5,
    acreage: 2100,
    askingPriceCents: 819_000_000,
    listingStatus: "pending",
    landUseType: "pasture",
    score: 75,
    band: "promising",
    targetDiscountPct: 7,
    confidence: "modeled",
    risks: [
      {
        riskType: "right_of_way_dispute",
        severity: "medium",
        description: "County-maintained road right-of-way width disputed by adjoining landowner; survey requested.",
      },
    ],
  },
  {
    parcelId: "HARD-2024-0003",
    county: "Hardee",
    address: "Hardee Timber Reserve",
    lng: -81.86,
    lat: 27.6,
    acreage: 1150,
    askingPriceCents: 322_000_000,
    listingStatus: "active",
    landUseType: "timber",
    score: 63,
    band: "watch",
    targetDiscountPct: -4,
    confidence: "ai_inferred",
  },
  {
    parcelId: "HARD-2024-0004",
    county: "Hardee",
    address: "Bowling Green Vacant Parcel",
    lng: -81.75,
    lat: 27.53,
    acreage: 22,
    askingPriceCents: 10_120_000,
    listingStatus: "off_market",
    landUseType: "vacant_agricultural",
    score: 58,
    band: "limited",
    targetDiscountPct: -10,
    confidence: "unknown",
  },

  // --- Polk County ---
  {
    parcelId: "POLK-2024-0001",
    county: "Polk",
    address: "Bartow Citrus & Row Crop Combo",
    lng: -81.8,
    lat: 27.92,
    acreage: 890,
    askingPriceCents: 676_400_000,
    listingStatus: "active",
    landUseType: "mixed_agricultural",
    score: 88,
    band: "strong",
    targetDiscountPct: 14,
    confidence: "verified",
  },
  {
    parcelId: "POLK-2024-0002",
    county: "Polk",
    address: "Fort Meade Row Crop Tract",
    lng: -81.86,
    lat: 27.86,
    acreage: 260,
    askingPriceCents: 236_600_000,
    listingStatus: "active",
    landUseType: "row_crop",
    score: 73,
    band: "promising",
    targetDiscountPct: 8,
    confidence: "modeled",
  },
  {
    parcelId: "POLK-2024-0003",
    county: "Polk",
    address: "Frostproof Citrus Grove",
    lng: -81.77,
    lat: 27.95,
    acreage: 175,
    askingPriceCents: 224_000_000,
    listingStatus: "active",
    landUseType: "citrus",
    score: 80,
    band: "strong",
    targetDiscountPct: 11,
    confidence: "ai_inferred",
    risks: [
      {
        riskType: "wetland_overlap",
        severity: "low",
        description: "NWI preliminary layer shows a small isolated wetland pocket along the southern grove edge.",
      },
      {
        riskType: "access_easement",
        severity: "low",
        description: "Grove access road crosses a neighboring parcel under an unrecorded handshake agreement.",
      },
    ],
  },
  {
    parcelId: "POLK-2024-0004",
    county: "Polk",
    address: "Polk Vacant Ag Reserve",
    lng: -81.9,
    lat: 27.88,
    acreage: 130,
    askingPriceCents: 46_800_000,
    listingStatus: "active",
    landUseType: "vacant_agricultural",
    score: 70,
    band: "promising",
    targetDiscountPct: 3,
    confidence: "unknown",
  },
];

function computeValuation(askingPriceCents: number, targetDiscountPct: number) {
  // estimated = asking / (1 - discount/100); round to whole cents, then
  // recompute the actual discount from the rounded estimate so the two
  // stored fields are always internally consistent.
  const estimatedValueCents = Math.round(askingPriceCents / (1 - targetDiscountPct / 100));
  const discountPct = ((estimatedValueCents - askingPriceCents) / estimatedValueCents) * 100;
  return { estimatedValueCents, discountPct: Math.round(discountPct * 100) / 100 };
}

// Report-tier catalog — small seeded reference data, not user-generated.
// Prices per REQUIREMENTS.md decision log #9 (confirmed launch pricing,
// cents): subscriber price / non-subscriber price (+50%). Premium has a row
// for pricing-page display only — not purchasable yet (`requiresHumanReview:
// true`; the analyst review-queue subsystem doesn't exist).
interface ReportTierSeed {
  code: string;
  displayName: string;
  subscriberPriceCents: number;
  nonSubscriberPriceCents: number;
  requiresHumanReview: boolean;
  sortOrder: number;
}

// Internal RBAC policy rows (schema.prisma's RolePermission header comment:
// "check role_permissions there instead of branching on role in code").
// `billing.read` is the first permission key this table actually gates
// (apps/api/src/admin-billing/admin-billing.controller.ts) — granted to
// the four personas whose REQUIREMENTS.md Section 9.4 descriptions involve
// billing/monetization visibility (Super Admin/Admin broadly; Billing
// Manager explicitly; Read-only Analyst for reporting access). Support
// Agent, Data QA Reviewer, Report Fulfillment Manager, and AI/Model
// Monitor are deliberately excluded — their personas don't call for
// billing visibility, and PermissionsService fails closed on no row, so
// omitting them is the correct "not allowed" state, not an oversight.
// `fulfillment.read`/`fulfillment.retry` (apps/api/src/admin-report-
// fulfillment/admin-report-fulfillment.controller.ts) follow the same
// fail-closed pattern. `.read` goes to the four personas with fulfillment
// visibility (Super Admin/Admin broadly, Report Fulfillment Manager
// explicitly, Read-only Analyst for reporting); `.retry` is narrower —
// only the three roles that should be able to trigger a real (paid-model)
// regeneration action, not the read-only persona.
const ROLE_PERMISSIONS: { role: InternalRole; permissionKey: string; allowed: boolean }[] = [
  { role: "super_admin", permissionKey: "billing.read", allowed: true },
  { role: "admin", permissionKey: "billing.read", allowed: true },
  { role: "billing_manager", permissionKey: "billing.read", allowed: true },
  { role: "readonly_analyst", permissionKey: "billing.read", allowed: true },

  { role: "super_admin", permissionKey: "fulfillment.read", allowed: true },
  { role: "admin", permissionKey: "fulfillment.read", allowed: true },
  { role: "report_fulfillment_manager", permissionKey: "fulfillment.read", allowed: true },
  { role: "readonly_analyst", permissionKey: "fulfillment.read", allowed: true },

  { role: "super_admin", permissionKey: "fulfillment.retry", allowed: true },
  { role: "admin", permissionKey: "fulfillment.retry", allowed: true },
  { role: "report_fulfillment_manager", permissionKey: "fulfillment.retry", allowed: true },
];

const REPORT_TIERS: ReportTierSeed[] = [
  {
    code: "essential",
    displayName: "Essential",
    subscriberPriceCents: 4900,
    nonSubscriberPriceCents: 7350,
    requiresHumanReview: false,
    sortOrder: 1,
  },
  {
    code: "investor",
    displayName: "Investor",
    subscriberPriceCents: 9900,
    nonSubscriberPriceCents: 14850,
    requiresHumanReview: false,
    sortOrder: 2,
  },
  {
    code: "professional",
    displayName: "Professional",
    subscriberPriceCents: 24900,
    nonSubscriberPriceCents: 37350,
    requiresHumanReview: false,
    sortOrder: 3,
  },
  {
    code: "premium",
    displayName: "Premium Intelligence",
    subscriberPriceCents: 49900,
    nonSubscriberPriceCents: 74850,
    requiresHumanReview: true,
    sortOrder: 4,
  },
];

async function main() {
  console.log("Seeding Property & Geospatial (Discover + Map Workspace) data...");

  // Idempotent: clear existing rows. Children cascade from `properties` via
  // ON DELETE CASCADE, so a single deleteMany is sufficient, but we're
  // explicit about ordering for readability/safety if cascade rules change.
  await prisma.propertyRiskFlag.deleteMany();
  await prisma.propertyValuation.deleteMany();
  await prisma.opportunityScore.deleteMany();
  await prisma.property.deleteMany();

  for (const p of PROPERTIES) {
    const id = crypto.randomUUID();

    // `location` (Unsupported geography type) must be written via raw SQL.
    await prisma.$executeRaw`
      INSERT INTO properties (
        id, county, state, parcel_id, address, location, acreage,
        asking_price_cents, listing_status, land_use_type, created_at, updated_at
      ) VALUES (
        ${id}::uuid, ${p.county}, 'FL', ${p.parcelId}, ${p.address},
        ST_SetSRID(ST_MakePoint(${p.lng}, ${p.lat}), 4326)::geography,
        ${new Prisma.Decimal(p.acreage)}, ${p.askingPriceCents},
        ${p.listingStatus}::listing_status, ${p.landUseType}::land_use_type,
        now(), now()
      )
    `;

    await prisma.opportunityScore.create({
      data: {
        propertyId: id,
        score: p.score,
        band: p.band,
      },
    });

    const { estimatedValueCents, discountPct } = computeValuation(p.askingPriceCents, p.targetDiscountPct);
    await prisma.propertyValuation.create({
      data: {
        propertyId: id,
        estimatedValueCents,
        discountPct: new Prisma.Decimal(discountPct),
        confidence: p.confidence,
      },
    });

    if (p.risks?.length) {
      await prisma.propertyRiskFlag.createMany({
        data: p.risks.map((r) => ({
          propertyId: id,
          riskType: r.riskType,
          severity: r.severity,
          description: r.description,
        })),
      });
    }
  }

  const propertyCount = await prisma.property.count();
  const scoreCount = await prisma.opportunityScore.count();
  const valuationCount = await prisma.propertyValuation.count();
  const riskFlagCount = await prisma.propertyRiskFlag.count();

  console.log(
    `Seeded ${propertyCount} properties, ${scoreCount} opportunity scores, ${valuationCount} valuations, ${riskFlagCount} risk flags.`,
  );

  // Report tiers: small seeded reference table, upserted (not deleted) so
  // FK'd `report_orders` rows referencing a tier code are never orphaned by
  // re-running this script.
  for (const tier of REPORT_TIERS) {
    await prisma.reportTier.upsert({
      where: { code: tier.code },
      create: tier,
      update: tier,
    });
  }

  const reportTierCount = await prisma.reportTier.count();
  console.log(`Seeded ${reportTierCount} report tiers.`);

  // Role permissions: policy config, upserted (not deleted) for the same
  // re-run-safety reason as report tiers above.
  for (const rp of ROLE_PERMISSIONS) {
    await prisma.rolePermission.upsert({
      where: { role_permissionKey: { role: rp.role, permissionKey: rp.permissionKey } },
      create: rp,
      update: { allowed: rp.allowed },
    });
  }

  console.log(`Seeded ${ROLE_PERMISSIONS.length} role_permissions rows.`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
