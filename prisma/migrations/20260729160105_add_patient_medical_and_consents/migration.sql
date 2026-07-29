-- AlterTable: antecedentes médicos del paciente
ALTER TABLE "patients"
  ADD COLUMN "heightCm" INTEGER,
  ADD COLUMN "weightKg" DOUBLE PRECISION,
  ADD COLUMN "allergies" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "allergyNotes" TEXT,
  ADD COLUMN "medicalConditions" TEXT,
  ADD COLUMN "currentMedications" TEXT;

-- CreateTable
CREATE TABLE "consent_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalText" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicaId" TEXT NOT NULL,

    CONSTRAINT "consent_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "consentTypeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendiente',
    "method" TEXT,
    "token" TEXT,
    "sentAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "signerName" TEXT,
    "signerRut" TEXT,
    "signerIp" TEXT,
    "userAgent" TEXT,
    "sentById" TEXT,
    "contentSnapshot" TEXT,
    "clinicaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "consent_types_clinicaId_code_key" ON "consent_types"("clinicaId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "consents_token_key" ON "consents"("token");

-- CreateIndex
CREATE INDEX "consents_clinicaId_idx" ON "consents"("clinicaId");

-- CreateIndex
CREATE UNIQUE INDEX "consents_patientId_consentTypeId_key" ON "consents"("patientId", "consentTypeId");

-- AddForeignKey
ALTER TABLE "consent_types" ADD CONSTRAINT "consent_types_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_consentTypeId_fkey" FOREIGN KEY ("consentTypeId") REFERENCES "consent_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DataMigration: crea el ConsentType "proteccion_datos" por cada clínica existente
-- (usando el texto legal que ya se enviaba) y copia la actividad de consentimiento
-- ya guardada en patients.privacyConsent* a la nueva tabla consents, antes de
-- eliminar esas columnas. En una base nueva/sin pacientes esto no inserta nada.
INSERT INTO "consent_types" ("id", "code", "name", "legalText", "clinicaId")
SELECT gen_random_uuid()::text, 'proteccion_datos', 'Protección de datos personales', '', c."id"
FROM "clinicas" c
ON CONFLICT ("clinicaId", "code") DO NOTHING;

-- El texto legal real se completa desde la aplicación (src/lib/consentTypes.ts)
-- la primera vez que se listan los tipos de consentimiento de una clínica que
-- todavía no los tiene (ver dataConsentsController.getTypes) — así que este
-- placeholder vacío es reemplazado automáticamente si quedara en blanco.

INSERT INTO "consents" (
  "id", "patientId", "consentTypeId", "status", "method", "token",
  "sentAt", "expiresAt", "respondedAt", "signerName", "signerRut",
  "signerIp", "userAgent", "sentById", "clinicaId", "updatedAt"
)
SELECT
  gen_random_uuid()::text, pt."id", ct."id", COALESCE(pt."privacyConsentStatus", 'pendiente'),
  pt."privacyConsentMethod", pt."privacyConsentToken", pt."privacyConsentSentAt",
  pt."privacyConsentExpiresAt", pt."privacyConsentAt", pt."privacyConsentSignerName",
  pt."privacyConsentSignerRut", pt."privacyConsentSignerIp", pt."privacyConsentUserAgent",
  pt."privacyConsentSentById", pt."clinicaId", CURRENT_TIMESTAMP
FROM "patients" pt
JOIN "consent_types" ct ON ct."clinicaId" = pt."clinicaId" AND ct."code" = 'proteccion_datos'
WHERE pt."privacyConsentSentAt" IS NOT NULL
   OR pt."privacyConsentAt" IS NOT NULL
   OR pt."privacyConsentToken" IS NOT NULL
ON CONFLICT ("patientId", "consentTypeId") DO NOTHING;

-- DropForeignKey
ALTER TABLE "patients" DROP CONSTRAINT IF EXISTS "patients_privacyConsentSentById_fkey";

-- DropIndex
DROP INDEX IF EXISTS "patients_privacyConsentToken_key";

-- AlterTable: quita las columnas legacy de consentimiento, ya migradas arriba
ALTER TABLE "patients"
  DROP COLUMN IF EXISTS "privacyConsentAt",
  DROP COLUMN IF EXISTS "privacyConsentStatus",
  DROP COLUMN IF EXISTS "privacyConsentMethod",
  DROP COLUMN IF EXISTS "privacyConsentToken",
  DROP COLUMN IF EXISTS "privacyConsentSentAt",
  DROP COLUMN IF EXISTS "privacyConsentExpiresAt",
  DROP COLUMN IF EXISTS "privacyConsentSignerName",
  DROP COLUMN IF EXISTS "privacyConsentSignerRut",
  DROP COLUMN IF EXISTS "privacyConsentSignerIp",
  DROP COLUMN IF EXISTS "privacyConsentUserAgent",
  DROP COLUMN IF EXISTS "privacyConsentSentById";
