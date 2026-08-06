CREATE TABLE "treatment_plan_photos" (
    "id" TEXT NOT NULL,
    "treatmentPlanId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "label" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicaId" TEXT NOT NULL,

    CONSTRAINT "treatment_plan_photos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "treatment_plan_photos_clinicaId_idx" ON "treatment_plan_photos"("clinicaId");

CREATE INDEX "treatment_plan_photos_treatmentPlanId_idx" ON "treatment_plan_photos"("treatmentPlanId");

ALTER TABLE "treatment_plan_photos" ADD CONSTRAINT "treatment_plan_photos_treatmentPlanId_fkey" FOREIGN KEY ("treatmentPlanId") REFERENCES "treatment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "treatment_plan_photos" ADD CONSTRAINT "treatment_plan_photos_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
