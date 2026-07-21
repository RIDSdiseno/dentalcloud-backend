-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "privacyConsentExpiresAt" TIMESTAMP(3),
ADD COLUMN     "privacyConsentSentById" TEXT,
ADD COLUMN     "privacyConsentSignerIp" TEXT,
ADD COLUMN     "privacyConsentSignerName" TEXT,
ADD COLUMN     "privacyConsentSignerRut" TEXT,
ADD COLUMN     "privacyConsentUserAgent" TEXT;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_privacyConsentSentById_fkey" FOREIGN KEY ("privacyConsentSentById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
