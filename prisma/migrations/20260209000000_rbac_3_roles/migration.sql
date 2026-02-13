-- Add 3-profile RBAC roles (admin/commercial/projects)

-- 1) Create enum type if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'UserRole'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "UserRole" AS ENUM ('admin', 'commercial', 'projects');
  END IF;
END$$;

-- 2) Normalize existing role values to the new 3-role model
UPDATE "users"
SET "role" = CASE
  WHEN "role" IN ('owner', 'admin') THEN 'admin'
  WHEN "role" = 'commercial' THEN 'commercial'
  WHEN "role" IN ('coordinator', 'user') THEN 'projects'
  ELSE 'projects'
END
WHERE "role" IS DISTINCT FROM CASE
  WHEN "role" IN ('owner', 'admin') THEN 'admin'
  WHEN "role" = 'commercial' THEN 'commercial'
  WHEN "role" IN ('coordinator', 'user') THEN 'projects'
  ELSE 'projects'
END;

-- 3) Convert column type safely (keeps data)
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "users"
ALTER COLUMN "role" TYPE "UserRole"
USING (
  CASE
    WHEN "role" IN ('owner', 'admin') THEN 'admin'
    WHEN "role" = 'commercial' THEN 'commercial'
    WHEN "role" IN ('coordinator', 'user') THEN 'projects'
    WHEN "role" IN ('admin', 'commercial', 'projects') THEN "role"
    ELSE 'projects'
  END
)::"UserRole";

ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'projects';
