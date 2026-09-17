/*
  Warnings:

  - A unique constraint covering the columns `[source,property_type,state,county,street_address,price_cents]` on the table `fsa_resale_listings` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "fsa_resale_listings_source_state_county_street_address_pric_key";

-- AlterTable
ALTER TABLE "fsa_resale_listings" ADD COLUMN     "bathrooms" DECIMAL(4,1),
ADD COLUMN     "bedrooms" INTEGER,
ADD COLUMN     "property_type" TEXT NOT NULL DEFAULT 'Farm & Ranch',
ADD COLUMN     "square_feet" INTEGER,
ADD COLUMN     "total_units" INTEGER;

-- CreateIndex
CREATE INDEX "fsa_resale_listings_property_type_idx" ON "fsa_resale_listings"("property_type");

-- CreateIndex
CREATE UNIQUE INDEX "fsa_resale_listings_source_property_type_state_county_stree_key" ON "fsa_resale_listings"("source", "property_type", "state", "county", "street_address", "price_cents");
