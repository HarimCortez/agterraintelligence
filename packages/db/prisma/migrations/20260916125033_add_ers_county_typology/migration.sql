-- AlterTable
ALTER TABLE "property_county_economic_summary" ADD COLUMN     "county_farming_dependent" BOOLEAN,
ADD COLUMN     "county_high_natural_amenities" BOOLEAN,
ADD COLUMN     "county_low_education" BOOLEAN,
ADD COLUMN     "county_low_employment" BOOLEAN,
ADD COLUMN     "county_population_loss" BOOLEAN,
ADD COLUMN     "county_retirement_destination" BOOLEAN;
