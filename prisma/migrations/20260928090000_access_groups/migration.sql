-- Grupos do diretório (AD) e as permissões que cada um concede.
ALTER TABLE "users" ADD COLUMN "directory_groups" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "access_groups" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "directory_dn" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "access_groups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "access_groups_key_key" ON "access_groups"("key");
CREATE UNIQUE INDEX "access_groups_directory_dn_key" ON "access_groups"("directory_dn");
CREATE INDEX "access_groups_is_active_idx" ON "access_groups"("is_active");
