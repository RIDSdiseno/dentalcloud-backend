-- Baseline: documents columns already present on `patients` for the data-privacy consent
-- flow (privacyConsentStatus/Token/SentAt/At/Method), which were applied directly against
-- the Railway database on 2026-07-10 by migrations whose local files were never committed
-- to this repository. This migration is marked as applied via `prisma migrate resolve`
-- (not executed) since the columns already exist; it exists only to keep local migration
-- history consistent with the database's `_prisma_migrations` table.

ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "privacyConsentStatus" TEXT NOT NULL DEFAULT 'pendiente';
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "privacyConsentToken" TEXT;
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "privacyConsentSentAt" TIMESTAMP(3);
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "privacyConsentAt" TIMESTAMP(3);
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "privacyConsentMethod" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE tablename = 'patients' AND indexname = 'patients_privacyConsentToken_key'
  ) THEN
    CREATE UNIQUE INDEX "patients_privacyConsentToken_key" ON "patients"("privacyConsentToken");
  END IF;
END $$;
