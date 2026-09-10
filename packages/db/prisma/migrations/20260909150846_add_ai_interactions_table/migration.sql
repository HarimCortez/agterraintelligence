-- DropIndex
DROP INDEX "properties_location_idx";

-- CreateTable
CREATE TABLE "ai_interactions" (
    "id" UUID NOT NULL,
    "property_id" UUID,
    "context_type" TEXT NOT NULL,
    "question" TEXT,
    "response" JSONB NOT NULL,
    "model_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_interactions_property_id_idx" ON "ai_interactions"("property_id");

-- CreateIndex
CREATE INDEX "ai_interactions_context_type_idx" ON "ai_interactions"("context_type");

-- CreateIndex
CREATE INDEX "ai_interactions_created_at_idx" ON "ai_interactions"("created_at");

-- AddForeignKey
ALTER TABLE "ai_interactions" ADD CONSTRAINT "ai_interactions_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
