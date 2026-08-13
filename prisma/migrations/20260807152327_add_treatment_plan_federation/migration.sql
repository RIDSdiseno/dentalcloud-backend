-- AlterTable
ALTER TABLE "treatment_plans" ADD COLUMN     "federatedTreatmentPlanId" TEXT;

-- AlterTable
ALTER TABLE "treatment_items" ADD COLUMN     "federatedTreatmentItemId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "treatment_plans_federatedTreatmentPlanId_key" ON "treatment_plans"("federatedTreatmentPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "treatment_items_federatedTreatmentItemId_key" ON "treatment_items"("federatedTreatmentItemId");
