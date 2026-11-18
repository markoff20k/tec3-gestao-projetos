-- Aditivo por categoria: linhas que ajustam (para mais ou para menos) as horas
-- contratadas de uma categoria da proposta. Pedido do cliente (18/11/2026).
CREATE TABLE "proposal_additive_category_lines" (
    "id" TEXT NOT NULL,
    "additive_id" TEXT NOT NULL,
    "category_id" TEXT,
    "custom_name" TEXT,
    "hours_delta" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "hourly_value" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "proposal_additive_category_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "proposal_additive_category_lines_additive_id_idx" ON "proposal_additive_category_lines"("additive_id");
CREATE INDEX "proposal_additive_category_lines_category_id_idx" ON "proposal_additive_category_lines"("category_id");

ALTER TABLE "proposal_additive_category_lines"
    ADD CONSTRAINT "proposal_additive_category_lines_additive_id_fkey"
    FOREIGN KEY ("additive_id") REFERENCES "proposal_additives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "proposal_additive_category_lines"
    ADD CONSTRAINT "proposal_additive_category_lines_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "proposal_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
