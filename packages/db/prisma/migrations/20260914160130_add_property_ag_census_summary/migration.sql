-- CreateTable
CREATE TABLE "property_ag_census_summary" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "county_cattle_inventory_head" INTEGER,
    "county_ag_land_value_cents_per_acre" INTEGER,
    "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_ag_census_summary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "property_ag_census_summary_property_id_key" ON "property_ag_census_summary"("property_id");

-- AddForeignKey
ALTER TABLE "property_ag_census_summary" ADD CONSTRAINT "property_ag_census_summary_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
