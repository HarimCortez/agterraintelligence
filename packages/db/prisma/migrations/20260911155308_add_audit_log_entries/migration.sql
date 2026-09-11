-- CreateTable
CREATE TABLE "audit_log_entries" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "actor_email" TEXT,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_log_entries_created_at_idx" ON "audit_log_entries"("created_at");

-- CreateIndex
CREATE INDEX "audit_log_entries_actor_id_idx" ON "audit_log_entries"("actor_id");

-- CreateIndex
CREATE INDEX "audit_log_entries_action_idx" ON "audit_log_entries"("action");

-- AddForeignKey
ALTER TABLE "audit_log_entries" ADD CONSTRAINT "audit_log_entries_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
