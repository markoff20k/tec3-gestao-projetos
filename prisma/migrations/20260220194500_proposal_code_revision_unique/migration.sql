-- Drop unique constraint/index on code only
ALTER TABLE "proposals" DROP CONSTRAINT IF EXISTS "proposals_code_key";
DROP INDEX IF EXISTS "proposals_code_key";

-- Enforce uniqueness per (code, revision)
CREATE UNIQUE INDEX IF NOT EXISTS "proposals_code_revision_key" ON "proposals"("code", "revision");
