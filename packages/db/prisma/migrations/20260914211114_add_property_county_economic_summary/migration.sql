-- CreateTable
CREATE TABLE "property_county_economic_summary" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "population_year" INTEGER NOT NULL,
    "county_population" INTEGER,
    "county_net_migration" INTEGER,
    "unemployment_year" INTEGER NOT NULL,
    "county_unemployment_rate_pct" DECIMAL(5,2),
    "income_year" INTEGER NOT NULL,
    "county_median_household_income_cents" INTEGER,
    "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_county_economic_summary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "property_county_economic_summary_property_id_key" ON "property_county_economic_summary"("property_id");

-- AddForeignKey
ALTER TABLE "property_county_economic_summary" ADD CONSTRAINT "property_county_economic_summary_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
