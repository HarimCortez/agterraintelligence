-- AlterTable
ALTER TABLE "property_ag_census_summary" ADD COLUMN     "county_agritourism_operations" INTEGER,
ADD COLUMN     "county_agritourism_receipts_cents" INTEGER,
ADD COLUMN     "county_berry_acres" INTEGER,
ADD COLUMN     "county_direct_farm_sales_pct" DECIMAL(6,4),
ADD COLUMN     "county_orchard_acres" INTEGER,
ADD COLUMN     "local_food_economy_year" INTEGER;
