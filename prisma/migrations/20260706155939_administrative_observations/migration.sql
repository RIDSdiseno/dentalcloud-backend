-- CreateTable
CREATE TABLE "administrative_observations" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "administrative_observations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "administrative_observations_patientId_createdAt_idx" ON "administrative_observations"("patientId", "createdAt");

-- AddForeignKey
ALTER TABLE "administrative_observations" ADD CONSTRAINT "administrative_observations_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "administrative_observations" ADD CONSTRAINT "administrative_observations_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
