ALTER TABLE "proposal_additives" ADD COLUMN IF NOT EXISTS "is_legacy_import" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "proposal_expenses" ADD COLUMN IF NOT EXISTS "is_legacy_import" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "proposal_category_values" ADD COLUMN IF NOT EXISTS "is_legacy_import" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "is_legacy_import" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "proposal_additives_isLegacyImport_idx" ON "proposal_additives" ("is_legacy_import");
CREATE INDEX IF NOT EXISTS "proposal_expenses_isLegacyImport_idx" ON "proposal_expenses" ("is_legacy_import");
CREATE INDEX IF NOT EXISTS "proposal_category_values_isLegacyImport_idx" ON "proposal_category_values" ("is_legacy_import");
CREATE INDEX IF NOT EXISTS "time_entries_isLegacyImport_idx" ON "time_entries" ("is_legacy_import");
