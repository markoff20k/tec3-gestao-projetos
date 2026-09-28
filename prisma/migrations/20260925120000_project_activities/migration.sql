-- AlterTable
ALTER TABLE "activities" ADD COLUMN     "legacy_id" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "activities_legacy_id_key" ON "activities"("legacy_id");

-- AlterTable
ALTER TABLE "time_entries" ADD COLUMN     "activity_id" TEXT;

-- CreateIndex
CREATE INDEX "time_entries_activity_id_idx" ON "time_entries"("activity_id");

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "project_activities" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "activity_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_activities_project_id_activity_id_key" ON "project_activities"("project_id", "activity_id");

-- CreateIndex
CREATE INDEX "project_activities_activity_id_idx" ON "project_activities"("activity_id");

-- AddForeignKey
ALTER TABLE "project_activities" ADD CONSTRAINT "project_activities_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_activities" ADD CONSTRAINT "project_activities_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
