-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "professionalId" TEXT;

-- CreateIndex
CREATE INDEX "appointments_professionalId_startAt_idx" ON "appointments"("professionalId", "startAt");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
