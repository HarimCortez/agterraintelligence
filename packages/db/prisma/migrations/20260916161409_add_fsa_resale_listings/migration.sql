-- CreateTable
CREATE TABLE "fsa_resale_listings" (
    "id" UUID NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'usda_rd_fsa_resales',
    "state" TEXT NOT NULL,
    "county" TEXT,
    "city" TEXT,
    "zip" TEXT,
    "street_address" TEXT,
    "listing_type" TEXT,
    "price_cents" INTEGER,
    "total_acres" DECIMAL(10,2),
    "cropland_acres" DECIMAL(10,2),
    "rangeland_acres" DECIMAL(10,2),
    "irrigated_acres" DECIMAL(10,2),
    "parcels" INTEGER,
    "mineral_rights" BOOLEAN,
    "easements" BOOLEAN,
    "auction_location" TEXT,
    "auction_date" DATE,
    "special_conditions" TEXT,
    "detail_url" TEXT,
    "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fsa_resale_listings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fsa_resale_listings_state_idx" ON "fsa_resale_listings"("state");

-- CreateIndex
CREATE UNIQUE INDEX "fsa_resale_listings_source_state_county_street_address_pric_key" ON "fsa_resale_listings"("source", "state", "county", "street_address", "price_cents");
