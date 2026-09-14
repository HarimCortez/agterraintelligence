-- CreateTable
CREATE TABLE "property_crop_cover" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "crop_code" INTEGER NOT NULL,
    "crop_description" TEXT NOT NULL,
    "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_crop_cover_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "property_crop_cover_property_id_key" ON "property_crop_cover"("property_id");

-- AddForeignKey
ALTER TABLE "property_crop_cover" ADD CONSTRAINT "property_crop_cover_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
