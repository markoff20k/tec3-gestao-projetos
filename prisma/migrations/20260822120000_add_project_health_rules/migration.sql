-- CreateTable
CREATE TABLE "project_health_rules" (
    "id" TEXT NOT NULL,
    "project_id" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "hours_enabled" BOOLEAN NOT NULL DEFAULT true,
    "hours_yellow" INTEGER NOT NULL DEFAULT 80,
    "hours_red" INTEGER NOT NULL DEFAULT 100,
    "financial_enabled" BOOLEAN NOT NULL DEFAULT true,
    "financial_yellow" INTEGER NOT NULL DEFAULT 5,
    "financial_red" INTEGER NOT NULL DEFAULT 12,
    "pending_hours_enabled" BOOLEAN NOT NULL DEFAULT true,
    "pending_hours_yellow" INTEGER NOT NULL DEFAULT 16,
    "pending_hours_red" INTEGER NOT NULL DEFAULT 40,
    "schedule_enabled" BOOLEAN NOT NULL DEFAULT true,
    "schedule_yellow_days" INTEGER NOT NULL DEFAULT 7,
    "schedule_red_days" INTEGER NOT NULL DEFAULT 15,

    CONSTRAINT "project_health_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_health_rules_project_id_key" ON "project_health_rules"("project_id");

-- AddForeignKey
ALTER TABLE "project_health_rules" ADD CONSTRAINT "project_health_rules_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
