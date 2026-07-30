-- AlterTable
ALTER TABLE "clinicas" ADD COLUMN "rut" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "clinicas_rut_key" ON "clinicas"("rut");
