-- DropForeignKey
ALTER TABLE "administrative_observations" DROP CONSTRAINT "administrative_observations_clinicaId_fkey";

-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_clinicaId_fkey";

-- DropForeignKey
ALTER TABLE "chairs" DROP CONSTRAINT "chairs_clinicaId_fkey";

-- DropForeignKey
ALTER TABLE "clinical_documents" DROP CONSTRAINT "clinical_documents_clinicaId_fkey";

-- DropForeignKey
ALTER TABLE "convenios" DROP CONSTRAINT "convenios_clinicaId_fkey";

-- DropForeignKey
ALTER TABLE "evolution_templates" DROP CONSTRAINT "evolution_templates_clinicaId_fkey";

-- DropForeignKey
ALTER TABLE "evolutions" DROP CONSTRAINT "evolutions_clinicaId_fkey";

-- DropForeignKey
ALTER TABLE "ledger_movements" DROP CONSTRAINT "ledger_movements_clinicaId_fkey";

-- DropForeignKey
ALTER TABLE "patients" DROP CONSTRAINT "patients_clinicaId_fkey";

-- DropForeignKey
ALTER TABLE "prestaciones" DROP CONSTRAINT "prestaciones_clinicaId_fkey";

-- DropForeignKey
ALTER TABLE "previsiones" DROP CONSTRAINT "previsiones_clinicaId_fkey";

-- DropForeignKey
ALTER TABLE "sucursales" DROP CONSTRAINT "sucursales_clinicaId_fkey";

-- DropForeignKey
ALTER TABLE "treatment_items" DROP CONSTRAINT "treatment_items_clinicaId_fkey";

-- DropForeignKey
ALTER TABLE "treatment_plans" DROP CONSTRAINT "treatment_plans_clinicaId_fkey";

-- DropForeignKey
ALTER TABLE "work_schedules" DROP CONSTRAINT "work_schedules_clinicaId_fkey";

-- DropIndex
DROP INDEX "chairs_number_key";

-- DropIndex
DROP INDEX "convenios_name_key";

-- DropIndex
DROP INDEX "patients_rut_key";

-- DropIndex
DROP INDEX "prestaciones_code_key";

-- DropIndex
DROP INDEX "previsiones_name_key";

-- DropIndex
ALTER TABLE "sucursales" DROP CONSTRAINT "sucursales_name_key";

-- AlterTable
ALTER TABLE "administrative_observations" ALTER COLUMN "clinicaId" SET NOT NULL;

-- AlterTable
ALTER TABLE "appointments" ALTER COLUMN "clinicaId" SET NOT NULL;

-- AlterTable
ALTER TABLE "chairs" ALTER COLUMN "clinicaId" SET NOT NULL;

-- AlterTable
ALTER TABLE "clinical_documents" ALTER COLUMN "clinicaId" SET NOT NULL;

-- AlterTable
ALTER TABLE "convenios" ALTER COLUMN "clinicaId" SET NOT NULL;

-- AlterTable
ALTER TABLE "evolution_templates" ALTER COLUMN "clinicaId" SET NOT NULL;

-- AlterTable
ALTER TABLE "evolutions" ALTER COLUMN "clinicaId" SET NOT NULL;

-- AlterTable
ALTER TABLE "ledger_movements" ALTER COLUMN "clinicaId" SET NOT NULL;

-- AlterTable
ALTER TABLE "patients" ALTER COLUMN "clinicaId" SET NOT NULL;

-- AlterTable
ALTER TABLE "prestaciones" ALTER COLUMN "clinicaId" SET NOT NULL;

-- AlterTable
ALTER TABLE "previsiones" ALTER COLUMN "clinicaId" SET NOT NULL;

-- AlterTable
ALTER TABLE "sucursales" ALTER COLUMN "clinicaId" SET NOT NULL;

-- AlterTable
ALTER TABLE "treatment_items" ALTER COLUMN "clinicaId" SET NOT NULL;

-- AlterTable
ALTER TABLE "treatment_plans" ALTER COLUMN "clinicaId" SET NOT NULL;

-- AlterTable
ALTER TABLE "work_schedules" ALTER COLUMN "clinicaId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "administrative_observations_clinicaId_idx" ON "administrative_observations"("clinicaId");

-- CreateIndex
CREATE INDEX "appointments_clinicaId_idx" ON "appointments"("clinicaId");

-- CreateIndex
CREATE UNIQUE INDEX "chairs_clinicaId_number_key" ON "chairs"("clinicaId", "number");

-- CreateIndex
CREATE INDEX "clinical_documents_clinicaId_idx" ON "clinical_documents"("clinicaId");

-- CreateIndex
CREATE UNIQUE INDEX "convenios_clinicaId_name_key" ON "convenios"("clinicaId", "name");

-- CreateIndex
CREATE INDEX "evolution_templates_clinicaId_idx" ON "evolution_templates"("clinicaId");

-- CreateIndex
CREATE INDEX "evolutions_clinicaId_idx" ON "evolutions"("clinicaId");

-- CreateIndex
CREATE INDEX "ledger_movements_clinicaId_idx" ON "ledger_movements"("clinicaId");

-- CreateIndex
CREATE UNIQUE INDEX "patients_clinicaId_rut_key" ON "patients"("clinicaId", "rut");

-- CreateIndex
CREATE UNIQUE INDEX "prestaciones_clinicaId_code_key" ON "prestaciones"("clinicaId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "previsiones_clinicaId_name_key" ON "previsiones"("clinicaId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "sucursales_clinicaId_name_key" ON "sucursales"("clinicaId", "name");

-- CreateIndex
CREATE INDEX "treatment_items_clinicaId_idx" ON "treatment_items"("clinicaId");

-- CreateIndex
CREATE INDEX "treatment_plans_clinicaId_idx" ON "treatment_plans"("clinicaId");

-- CreateIndex
CREATE INDEX "users_clinicaId_idx" ON "users"("clinicaId");

-- CreateIndex
CREATE INDEX "work_schedules_clinicaId_idx" ON "work_schedules"("clinicaId");

-- AddForeignKey
ALTER TABLE "chairs" ADD CONSTRAINT "chairs_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_items" ADD CONSTRAINT "treatment_items_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sucursales" ADD CONSTRAINT "sucursales_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "previsiones" ADD CONSTRAINT "previsiones_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convenios" ADD CONSTRAINT "convenios_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prestaciones" ADD CONSTRAINT "prestaciones_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "administrative_observations" ADD CONSTRAINT "administrative_observations_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_documents" ADD CONSTRAINT "clinical_documents_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evolutions" ADD CONSTRAINT "evolutions_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evolution_templates" ADD CONSTRAINT "evolution_templates_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_movements" ADD CONSTRAINT "ledger_movements_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

