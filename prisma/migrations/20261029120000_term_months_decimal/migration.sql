-- Prazo em meses passa a aceitar fração (ex.: 0.5 = quinze dias).
-- Alargamento de tipo: nenhum dado existente muda de valor.
ALTER TABLE "proposals" ALTER COLUMN "term_months" TYPE DOUBLE PRECISION;
ALTER TABLE "proposal_additives" ALTER COLUMN "term_months" TYPE DOUBLE PRECISION;
