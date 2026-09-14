-- CreateTable
CREATE TABLE "property_timber_summary" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "county_timberland_acres" INTEGER,
    "county_timber_volume_cu_ft_per_acre" INTEGER,
    "county_timber_volume_sampling_error_pct" DECIMAL(5,2),
    "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_timber_summary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "property_timber_summary_property_id_key" ON "property_timber_summary"("property_id");

-- AddForeignKey
ALTER TABLE "property_timber_summary" ADD CONSTRAINT "property_timber_summary_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
