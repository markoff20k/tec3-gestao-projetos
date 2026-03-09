-- CreateTable
CREATE TABLE "proposal_expenses" (
    "id" TEXT NOT NULL,
    "proposal_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "value" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "reimbursable" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "proposal_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "proposal_expenses_proposal_id_created_at_idx" ON "proposal_expenses"("proposal_id", "created_at");

-- AddForeignKey
ALTER TABLE "proposal_expenses" ADD CONSTRAINT "proposal_expenses_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
