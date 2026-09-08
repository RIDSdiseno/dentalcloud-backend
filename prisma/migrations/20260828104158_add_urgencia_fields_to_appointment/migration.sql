-- AlterTable
ALTER TABLE "appointments" ADD COLUMN "motivoUrgencia" TEXT;
ALTER TABLE "appointments" ADD COLUMN "triageLevel" TEXT;
ALTER TABLE "appointments" ADD COLUMN "receivedByUserId" TEXT;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_receivedByUserId_fkey" FOREIGN KEY ("receivedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
