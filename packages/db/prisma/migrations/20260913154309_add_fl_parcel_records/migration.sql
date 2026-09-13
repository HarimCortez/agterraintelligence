-- Hand-written (not `prisma migrate dev`, which refuses to run
-- non-interactively and would otherwise generate a DROP+ADD instead of a
-- rename, discarding the 2 real ingestion_runs rows already in this
-- database). RENAME COLUMN preserves that real data.

-- RenameColumn
ALTER TABLE "ingestion_runs" RENAME COLUMN "properties_checked" TO "items_processed";
ALTER TABLE "ingestion_runs" RENAME COLUMN "flags_created" TO "records_created";

-- CreateTable
CREATE TABLE "parcel_records" (
    "id" UUID NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'fl_dor_cadastral',
    "county" TEXT NOT NULL,
    "parcel_id" TEXT NOT NULL,
    "owner_name" TEXT,
    "site_address" TEXT,
    "site_city" TEXT,
    "legal_description" TEXT,
    "dor_use_code" TEXT NOT NULL,
    "dor_use_description" TEXT NOT NULL,
    "acreage" DECIMAL(10,2) NOT NULL,
    "just_value_cents" INTEGER NOT NULL,
    "assessment_year" INTEGER,
    "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parcel_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "parcel_records_source_parcel_id_key" ON "parcel_records"("source", "parcel_id");

-- CreateIndex
CREATE INDEX "parcel_records_county_idx" ON "parcel_records"("county");

-- CreateIndex
CREATE INDEX "parcel_records_dor_use_code_idx" ON "parcel_records"("dor_use_code");
