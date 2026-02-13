-- Align proposal statuses with legacy system (screenshot)

-- Convert old status values to the new legacy set
UPDATE "proposals" SET "status" = 'em_elaboracao' WHERE "status" = 'draft';
UPDATE "proposals" SET "status" = 'em_analise' WHERE "status" IN ('in_review', 'sent', 'negotiating');
UPDATE "proposals" SET "status" = 'com_sucesso' WHERE "status" IN ('approved', 'converted');
UPDATE "proposals" SET "status" = 'nao_sucesso' WHERE "status" = 'rejected';
UPDATE "proposals" SET "status" = 'cancelada' WHERE "status" = 'cancelled';

-- Update default for new records
ALTER TABLE "proposals" ALTER COLUMN "status" SET DEFAULT 'em_elaboracao';