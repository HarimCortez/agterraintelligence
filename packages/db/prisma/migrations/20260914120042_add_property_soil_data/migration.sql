-- CreateTable
CREATE TABLE "property_soil_data" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "map_unit_key" TEXT NOT NULL,
    "map_unit_symbol" TEXT NOT NULL,
    "map_unit_name" TEXT NOT NULL,
    "drainage_class" TEXT,
    "flood_frequency" TEXT,
    "slope_percent" DECIMAL(5,2),
    "capability_class" TEXT,
    "hydric_pct" INTEGER,
    "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_soil_data_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "property_soil_data_property_id_key" ON "property_soil_data"("property_id");

-- AddForeignKey
ALTER TABLE "property_soil_data" ADD CONSTRAINT "property_soil_data_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
