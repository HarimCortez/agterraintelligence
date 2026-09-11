-- CreateEnum
CREATE TYPE "ai_call_status" AS ENUM ('succeeded', 'failed');

-- CreateTable
CREATE TABLE "ai_call_logs" (
    "id" UUID NOT NULL,
    "feature" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" "ai_call_status" NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "output_tokens" INTEGER,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_call_logs_status_idx" ON "ai_call_logs"("status");

-- CreateIndex
CREATE INDEX "ai_call_logs_feature_idx" ON "ai_call_logs"("feature");

-- CreateIndex
CREATE INDEX "ai_call_logs_created_at_idx" ON "ai_call_logs"("created_at");
