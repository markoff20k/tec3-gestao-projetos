-- CreateTable
CREATE TABLE "proposal_additives" (
    "id" TEXT NOT NULL,
    "proposal_id" TEXT NOT NULL,
    "term_months" INTEGER,
    "subcontract_value" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "mobilization_value" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "readjust_value" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "proposal_additives_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "proposal_additives_proposal_id_created_at_idx" ON "proposal_additives"("proposal_id", "created_at");

-- AddForeignKey
ALTER TABLE "proposal_additives" ADD CONSTRAINT "proposal_additives_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
