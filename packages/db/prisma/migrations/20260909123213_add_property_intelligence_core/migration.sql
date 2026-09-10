-- CreateEnum
CREATE TYPE "listing_status" AS ENUM ('active', 'pending', 'sold', 'off_market');

-- CreateEnum
CREATE TYPE "land_use_type" AS ENUM ('row_crop', 'pasture', 'timber', 'citrus', 'mixed_agricultural', 'vacant_agricultural');

-- CreateEnum
CREATE TYPE "opportunity_band" AS ENUM ('exceptional', 'strong', 'promising', 'watch', 'limited');

-- CreateEnum
CREATE TYPE "valuation_confidence" AS ENUM ('verified', 'modeled', 'ai_inferred', 'unknown');

-- CreateEnum
CREATE TYPE "risk_severity" AS ENUM ('low', 'medium', 'high');

-- CreateTable
CREATE TABLE "properties" (
    "id" UUID NOT NULL,
    "county" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'FL',
    "parcel_id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "location" geography(Point, 4326) NOT NULL,
    "acreage" DECIMAL(10,2) NOT NULL,
    "asking_price_cents" INTEGER NOT NULL,
    "listing_status" "listing_status" NOT NULL DEFAULT 'active',
    "land_use_type" "land_use_type" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_scores" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "band" "opportunity_band" NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opportunity_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_valuations" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "estimated_value_cents" INTEGER NOT NULL,
    "discount_pct" DECIMAL(6,2) NOT NULL,
    "confidence" "valuation_confidence" NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_valuations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_risk_flags" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "risk_type" TEXT NOT NULL,
    "severity" "risk_severity" NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_risk_flags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- GIST index on the PostGIS geography column. Prisma does not generate
-- indexes for Unsupported() columns from the schema, so this is hand-added.
-- Required for performant bbox/radius queries backing the Discover + Map
-- Workspace (`/v1/search` per ARCHITECTURE.md's API surface).
CREATE INDEX "properties_location_idx" ON "properties" USING GIST ("location");

-- CreateIndex
CREATE UNIQUE INDEX "properties_parcel_id_key" ON "properties"("parcel_id");

-- CreateIndex
CREATE INDEX "properties_county_idx" ON "properties"("county");

-- CreateIndex
CREATE INDEX "properties_state_idx" ON "properties"("state");

-- CreateIndex
CREATE INDEX "properties_listing_status_idx" ON "properties"("listing_status");

-- CreateIndex
CREATE INDEX "properties_land_use_type_idx" ON "properties"("land_use_type");

-- CreateIndex
CREATE UNIQUE INDEX "opportunity_scores_property_id_key" ON "opportunity_scores"("property_id");

-- CreateIndex
CREATE INDEX "opportunity_scores_band_idx" ON "opportunity_scores"("band");

-- CreateIndex
CREATE INDEX "opportunity_scores_score_idx" ON "opportunity_scores"("score");

-- CreateIndex
CREATE UNIQUE INDEX "property_valuations_property_id_key" ON "property_valuations"("property_id");

-- CreateIndex
CREATE INDEX "property_valuations_confidence_idx" ON "property_valuations"("confidence");

-- CreateIndex
CREATE INDEX "property_risk_flags_property_id_idx" ON "property_risk_flags"("property_id");

-- CreateIndex
CREATE INDEX "property_risk_flags_severity_idx" ON "property_risk_flags"("severity");

-- AddForeignKey
ALTER TABLE "opportunity_scores" ADD CONSTRAINT "opportunity_scores_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_valuations" ADD CONSTRAINT "property_valuations_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_risk_flags" ADD CONSTRAINT "property_risk_flags_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CheckConstraint: enforceable integrity rules preferred at the DB level
-- (per data-engineering mandate) rather than left to application-only
-- validation.

-- properties: acreage/price must be positive quantities.
ALTER TABLE "properties" ADD CONSTRAINT "properties_acreage_positive_check" CHECK ("acreage" > 0);
ALTER TABLE "properties" ADD CONSTRAINT "properties_asking_price_non_negative_check" CHECK ("asking_price_cents" >= 0);

-- opportunity_scores: score must be within the PRD's 0-100 range, and
-- `band` must always match `score` per REQUIREMENTS.md Section 8.1's band
-- ranges — this stops a bad write (app bug or manual edit) from ever
-- desyncing the stored band from the score it's supposed to represent.
ALTER TABLE "opportunity_scores" ADD CONSTRAINT "opportunity_scores_score_range_check" CHECK ("score" >= 0 AND "score" <= 100);
ALTER TABLE "opportunity_scores" ADD CONSTRAINT "opportunity_scores_band_matches_score_check" CHECK (
  ("band" = 'exceptional' AND "score" BETWEEN 90 AND 100) OR
  ("band" = 'strong'      AND "score" BETWEEN 80 AND 89) OR
  ("band" = 'promising'   AND "score" BETWEEN 70 AND 79) OR
  ("band" = 'watch'       AND "score" BETWEEN 60 AND 69) OR
  ("band" = 'limited'     AND "score" < 60)
);

-- property_valuations: estimated value must be a non-negative amount.
ALTER TABLE "property_valuations" ADD CONSTRAINT "property_valuations_estimated_value_non_negative_check" CHECK ("estimated_value_cents" >= 0);
