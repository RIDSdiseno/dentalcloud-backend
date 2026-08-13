-- AlterTable
ALTER TABLE "convenios" ADD COLUMN     "federatedConvenioId" TEXT;

-- AlterTable
ALTER TABLE "prestaciones" ADD COLUMN     "federatedPrestacionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "convenios_federatedConvenioId_key" ON "convenios"("federatedConvenioId");

-- CreateIndex
CREATE UNIQUE INDEX "prestaciones_federatedPrestacionId_key" ON "prestaciones"("federatedPrestacionId");
