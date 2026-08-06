-- AlterTable
ALTER TABLE "clinicas" ADD COLUMN "pais" TEXT NOT NULL DEFAULT 'Chile';

-- AlterTable
ALTER TABLE "treatment_plans" ADD COLUMN "diagramType" TEXT NOT NULL DEFAULT 'dental';

-- CreateTable
-- NOTA: esta tabla ya existía en la base de producción (aplicada directamente
-- por otra máquina, sin migración commiteada) al momento de esta migración.
-- Se documenta aquí en vez de con CREATE TABLE porque ya está creada; se deja
-- el DDL completo como referencia de la estructura real.
-- CREATE TABLE "treatment_plan_photos" (
--     "id" TEXT NOT NULL,
--     "treatmentPlanId" TEXT NOT NULL,
--     "url" TEXT NOT NULL,
--     "publicId" TEXT NOT NULL,
--     "label" TEXT,
--     "position" INTEGER NOT NULL DEFAULT 0,
--     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
--     "clinicaId" TEXT NOT NULL,
--     CONSTRAINT "treatment_plan_photos_pkey" PRIMARY KEY ("id")
-- );
-- CREATE INDEX "treatment_plan_photos_treatmentPlanId_idx" ON "treatment_plan_photos"("treatmentPlanId");
-- CREATE INDEX "treatment_plan_photos_clinicaId_idx" ON "treatment_plan_photos"("clinicaId");
-- ALTER TABLE "treatment_plan_photos" ADD CONSTRAINT "treatment_plan_photos_treatmentPlanId_fkey" FOREIGN KEY ("treatmentPlanId") REFERENCES "treatment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- ALTER TABLE "treatment_plan_photos" ADD CONSTRAINT "treatment_plan_photos_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
