-- AlterTable
ALTER TABLE "consent_types" ADD COLUMN "pdfUrl" TEXT;
ALTER TABLE "consent_types" ADD COLUMN "pdfPublicId" TEXT;

-- AlterTable
ALTER TABLE "consents" ADD COLUMN "pdfSnapshotUrl" TEXT;

-- NOTA: aplicada directamente contra producción vía `prisma db push
-- --accept-data-loss` (Railway), documentada aquí después del hecho, mismo
-- procedimiento ya usado en migraciones anteriores de este proyecto. El
-- --accept-data-loss de esa corrida correspondía a un drift previo y no
-- relacionado (columnas `facialAnnotations`/`facialGender` de
-- `treatment_plans` y la tabla `treatment_item_photos`, ya sin referencias en
-- el código backend), confirmado con el usuario antes de aplicar.
