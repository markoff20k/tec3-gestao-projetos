-- Mobilização e desconto compõem o total da proposta junto com as categorias.
-- Sem persistir os dois, recalcular o total a partir das categorias perderia
-- essas parcelas, que hoje só existem no banco legado.
ALTER TABLE "proposals" ADD COLUMN "mobilization_value" DECIMAL(12,2) DEFAULT 0;
ALTER TABLE "proposals" ADD COLUMN "discount_value" DECIMAL(12,2) DEFAULT 0;
