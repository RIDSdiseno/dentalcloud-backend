-- Anulación de evoluciones en vez de borrado.
--
-- Una evolución es registro clínico: borrarla sería fraude (planteado por el
-- cliente en la reunión del 30/09). Hasta ahora se eliminaba de verdad y,
-- aunque quedaba una copia en evolution_deletions, esa tabla no se muestra en
-- ninguna pantalla — la evolución desaparecía del historial del paciente, que
-- es justo lo que el respaldo legal busca impedir.
--
-- Aditivo y nullable: las evoluciones existentes quedan con anuladaAt = NULL,
-- es decir vigentes, que es lo correcto.

ALTER TABLE "evolutions" ADD COLUMN "anuladaAt" TIMESTAMP(3);
ALTER TABLE "evolutions" ADD COLUMN "anuladaPorId" TEXT;
ALTER TABLE "evolutions" ADD COLUMN "anulacionMotivo" TEXT;

ALTER TABLE "evolutions"
  ADD CONSTRAINT "evolutions_anuladaPorId_fkey"
  FOREIGN KEY ("anuladaPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
