-- AlterTable
ALTER TABLE "previsiones" ADD COLUMN     "federatedPrevisionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "previsiones_federatedPrevisionId_key" ON "previsiones"("federatedPrevisionId");
