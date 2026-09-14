-- CreateTable
CREATE TABLE "property_crop_loss_summary" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "county_top_cause_of_loss" TEXT,
    "county_top_cause_of_loss_indemnity_cents" BIGINT,
    "county_total_indemnity_cents" BIGINT,
    "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_crop_loss_summary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "property_crop_loss_summary_property_id_key" ON "property_crop_loss_summary"("property_id");

-- AddForeignKey
ALTER TABLE "property_crop_loss_summary" ADD CONSTRAINT "property_crop_loss_summary_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
