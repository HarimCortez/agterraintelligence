-- Restore the hand-added GIST index on properties.location
-- This index was dropped by the previous migration (phantom drift from Prisma's
-- schema model) and must be recreated for bbox/radius queries to work efficiently.
-- See CLAUDE.md's "⚠️ prisma migrate dev will show phantom drift" warning.

CREATE INDEX "properties_location_idx" ON "properties" USING GIST ("location");
