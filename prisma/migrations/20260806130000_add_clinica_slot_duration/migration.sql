-- AlterTable
ALTER TABLE "clinicas" ADD COLUMN "slotDurationMinutes" INTEGER NOT NULL DEFAULT 15;

-- NOTA: aplicada directamente contra producción vía `prisma db push
-- --accept-data-loss` (Railway), documentada aquí después del hecho, mismo
-- procedimiento ya usado en migraciones anteriores de este proyecto. El
-- --accept-data-loss de esa corrida correspondía a un drift previo y no
-- relacionado (columna `prestaciones.requiresProductTracking`, sin referencias
-- en el código y con sus 248 filas en el mismo valor `false` — sin señal real
-- que perder), verificado con una consulta antes de aceptar y confirmado con
-- el usuario.
