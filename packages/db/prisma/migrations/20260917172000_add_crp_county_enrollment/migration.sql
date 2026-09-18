-- CreateTable
CREATE TABLE "property_crp_enrollment" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "report_period" TEXT NOT NULL,
    "practice_label" TEXT NOT NULL,
    "practice_code" TEXT,
    "acres" DECIMAL(10,2) NOT NULL,
    "is_total" BOOLEAN NOT NULL DEFAULT false,
    "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_crp_enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "property_crp_enrollment_property_id_idx" ON "property_crp_enrollment"("property_id");

-- CreateIndex
CREATE UNIQUE INDEX "property_crp_enrollment_property_id_report_period_practice__key" ON "property_crp_enrollment"("property_id", "report_period", "practice_label");

-- AddForeignKey
ALTER TABLE "property_crp_enrollment" ADD CONSTRAINT "property_crp_enrollment_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
