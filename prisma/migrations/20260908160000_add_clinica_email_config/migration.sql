-- CreateTable
CREATE TABLE "clinica_email_configs" (
    "id" TEXT NOT NULL,
    "clinicaId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'smtp',
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
    "smtpUsername" TEXT,
    "smtpPasswordEncrypted" TEXT,
    "fromEmail" TEXT,
    "fromName" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinica_email_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clinica_email_configs_clinicaId_key" ON "clinica_email_configs"("clinicaId");

-- AddForeignKey
ALTER TABLE "clinica_email_configs" ADD CONSTRAINT "clinica_email_configs_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
