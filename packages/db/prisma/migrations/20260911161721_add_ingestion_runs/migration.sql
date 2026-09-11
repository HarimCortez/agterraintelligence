-- CreateEnum
CREATE TYPE "ingestion_run_status" AS ENUM ('running', 'succeeded', 'failed');

-- CreateTable
CREATE TABLE "ingestion_runs" (
    "id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "status" "ingestion_run_status" NOT NULL DEFAULT 'running',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "properties_checked" INTEGER NOT NULL DEFAULT 0,
    "flags_created" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,

    CONSTRAINT "ingestion_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ingestion_runs_source_idx" ON "ingestion_runs"("source");

-- CreateIndex
CREATE INDEX "ingestion_runs_started_at_idx" ON "ingestion_runs"("started_at");
