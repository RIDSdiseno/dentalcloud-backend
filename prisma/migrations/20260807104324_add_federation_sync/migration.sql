-- AlterTable
ALTER TABLE "clinicas" ADD COLUMN     "federatedClinicId" TEXT;

-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "federatedPatientId" TEXT;

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "federatedAppointmentId" TEXT;

-- CreateTable
CREATE TABLE "federation_sync_failures" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "lastError" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "federation_sync_failures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clinicas_federatedClinicId_key" ON "clinicas"("federatedClinicId");

-- CreateIndex
CREATE UNIQUE INDEX "patients_federatedPatientId_key" ON "patients"("federatedPatientId");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_federatedAppointmentId_key" ON "appointments"("federatedAppointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "federation_sync_failures_entityType_localId_key" ON "federation_sync_failures"("entityType", "localId");
