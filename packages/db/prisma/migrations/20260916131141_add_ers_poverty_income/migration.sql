-- AlterTable
ALTER TABLE "property_county_economic_summary" ADD COLUMN     "county_child_poverty_rate_pct" DECIMAL(5,2),
ADD COLUMN     "county_deep_poverty_rate_pct" DECIMAL(5,2),
ADD COLUMN     "county_per_capita_income_cents" INTEGER,
ADD COLUMN     "county_poverty_rate_pct" DECIMAL(5,2),
ADD COLUMN     "poverty_income_year" INTEGER;
