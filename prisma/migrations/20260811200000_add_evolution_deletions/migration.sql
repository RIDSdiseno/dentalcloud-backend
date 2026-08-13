CREATE TABLE "evolution_deletions" (
    "id" TEXT NOT NULL,
    "evolutionId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "deletedByUserId" TEXT NOT NULL,
    "clinicaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evolution_deletions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "evolution_deletions_clinicaId_idx" ON "evolution_deletions"("clinicaId");
CREATE INDEX "evolution_deletions_patientId_idx" ON "evolution_deletions"("patientId");

ALTER TABLE "evolution_deletions" ADD CONSTRAINT "evolution_deletions_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evolution_deletions" ADD CONSTRAINT "evolution_deletions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evolution_deletions" ADD CONSTRAINT "evolution_deletions_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
