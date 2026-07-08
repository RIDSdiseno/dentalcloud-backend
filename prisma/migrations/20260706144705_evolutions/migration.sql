-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'cita';

-- CreateTable
CREATE TABLE "evolutions" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evolutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evolution_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "section" TEXT,
    "content" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evolution_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evolutions_patientId_createdAt_idx" ON "evolutions"("patientId", "createdAt");

-- AddForeignKey
ALTER TABLE "evolutions" ADD CONSTRAINT "evolutions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evolutions" ADD CONSTRAINT "evolutions_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
