-- AlterTable
ALTER TABLE "cost_centers" ADD COLUMN     "is_administrative" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "project_id" TEXT;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "is_administrative" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "cost_centers_is_administrative_idx" ON "cost_centers"("is_administrative");

-- CreateIndex
CREATE INDEX "cost_centers_project_id_idx" ON "cost_centers"("project_id");

-- AddForeignKey
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Vincula cada centro de custo gerado pelo backfill ao projeto de mesmo codigo.
UPDATE "cost_centers" cc
SET "project_id" = p."id"
FROM "projects" p
WHERE upper(btrim(cc."code")) = upper(btrim(p."code"));

-- Marca como administrativos os centros de custo de ausencia/apoio (A25002..A25009)
-- e os desvincula de projeto: eles passam a ser ofertados dentro de qualquer projeto.
UPDATE "cost_centers"
SET "is_administrative" = true,
    "project_id" = NULL
WHERE upper(btrim("code")) IN (
  'A25002', 'A25003', 'A25004', 'A25005', 'A25006', 'A25007', 'A25008', 'A25009'
);

-- Os projetos correspondentes deixam de ser lancaveis na grade de horas:
-- as horas passam a ser apontadas pelo centro de custo administrativo.
-- A25001 (Administrativo) permanece lancavel e hospeda esses centros de custo.
UPDATE "projects"
SET "is_administrative" = true
WHERE upper(btrim("code")) IN (
  'A25002', 'A25003', 'A25004', 'A25005', 'A25006', 'A25007', 'A25008', 'A25009'
);
