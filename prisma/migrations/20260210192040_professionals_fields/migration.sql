-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_group" TEXT,
ADD COLUMN     "professional_category_id" TEXT,
ADD COLUMN     "receives_emails" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_professional_category_id_fkey" FOREIGN KEY ("professional_category_id") REFERENCES "proposal_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
