-- AlterTable
ALTER TABLE "treatment_items" ADD COLUMN "treatedById" TEXT;
ALTER TABLE "treatment_items" ADD COLUMN "treatedAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "treatment_items" ADD CONSTRAINT "treatment_items_treatedById_fkey" FOREIGN KEY ("treatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
