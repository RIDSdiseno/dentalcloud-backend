-- AlterTable
ALTER TABLE "administrative_observations" ADD COLUMN     "clinicaId" TEXT;

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "clinicaId" TEXT;

-- AlterTable
ALTER TABLE "chairs" ADD COLUMN     "clinicaId" TEXT;

-- AlterTable
ALTER TABLE "clinical_documents" ADD COLUMN     "clinicaId" TEXT;

-- AlterTable
ALTER TABLE "convenios" ADD COLUMN     "clinicaId" TEXT;

-- AlterTable
ALTER TABLE "evolution_templates" ADD COLUMN     "clinicaId" TEXT;

-- AlterTable
ALTER TABLE "evolutions" ADD COLUMN     "clinicaId" TEXT;

-- AlterTable
ALTER TABLE "ledger_movements" ADD COLUMN     "clinicaId" TEXT;

-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "clinicaId" TEXT;

-- AlterTable
ALTER TABLE "prestaciones" ADD COLUMN     "clinicaId" TEXT;

-- AlterTable
ALTER TABLE "previsiones" ADD COLUMN     "clinicaId" TEXT;

-- AlterTable
ALTER TABLE "sucursales" ADD COLUMN     "clinicaId" TEXT;

-- AlterTable
ALTER TABLE "treatment_items" ADD COLUMN     "clinicaId" TEXT;

-- AlterTable
ALTER TABLE "treatment_plans" ADD COLUMN     "clinicaId" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "clinicaId" TEXT;

-- AlterTable
ALTER TABLE "work_schedules" ADD COLUMN     "clinicaId" TEXT;

-- CreateTable
CREATE TABLE "clinicas" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinicas_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chairs" ADD CONSTRAINT "chairs_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_items" ADD CONSTRAINT "treatment_items_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sucursales" ADD CONSTRAINT "sucursales_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "previsiones" ADD CONSTRAINT "previsiones_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convenios" ADD CONSTRAINT "convenios_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prestaciones" ADD CONSTRAINT "prestaciones_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "administrative_observations" ADD CONSTRAINT "administrative_observations_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_documents" ADD CONSTRAINT "clinical_documents_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evolutions" ADD CONSTRAINT "evolutions_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evolution_templates" ADD CONSTRAINT "evolution_templates_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_movements" ADD CONSTRAINT "ledger_movements_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
