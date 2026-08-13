CREATE TABLE "treatment_plan_edits" (
    "id" TEXT NOT NULL,
    "treatmentPlanId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicaId" TEXT NOT NULL,

    CONSTRAINT "treatment_plan_edits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "treatment_plan_edits_clinicaId_idx" ON "treatment_plan_edits"("clinicaId");
CREATE INDEX "treatment_plan_edits_treatmentPlanId_idx" ON "treatment_plan_edits"("treatmentPlanId");

ALTER TABLE "treatment_plan_edits" ADD CONSTRAINT "treatment_plan_edits_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "treatment_plan_edits" ADD CONSTRAINT "treatment_plan_edits_treatmentPlanId_fkey" FOREIGN KEY ("treatmentPlanId") REFERENCES "treatment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "treatment_plan_edits" ADD CONSTRAINT "treatment_plan_edits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
