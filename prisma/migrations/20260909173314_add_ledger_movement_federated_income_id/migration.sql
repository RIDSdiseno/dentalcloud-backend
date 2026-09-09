-- AlterTable
ALTER TABLE "ledger_movements" ADD COLUMN     "federatedIncomeId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ledger_movements_federatedIncomeId_key" ON "ledger_movements"("federatedIncomeId");
