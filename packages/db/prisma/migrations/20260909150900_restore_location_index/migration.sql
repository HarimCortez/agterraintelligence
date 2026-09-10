-- CreateIndex
-- Restore the GIST index on properties.location that was dropped by the
-- ai_interactions migration due to phantom drift. The index is hand-added
-- (Prisma doesn't model indexes on Unsupported() columns) and required for
-- performant bbox/radius queries in the Discover + Map Workspace.
CREATE INDEX "properties_location_idx" ON "properties" USING GIST ("location");
