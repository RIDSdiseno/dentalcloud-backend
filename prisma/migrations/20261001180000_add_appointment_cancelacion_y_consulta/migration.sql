-- Agenda: motivo de cancelacion y tipo de consulta (reunion 30/09, tareas 20 y 21).
--
-- 20: cancelar una cita pide el motivo y la cita no desaparece — queda
--     registrada con quien la cancelo, cuando y por que.
-- 21: al agendar se elige "Primera vez / Tratamiento" y, si es tratamiento,
--     el motivo por el que viene. Antes todo iba mezclado en `notes`.
--
-- Aditivo y nullable: las citas existentes quedan con todo en NULL. Las ya
-- canceladas conservan su `status = 'cancelada'` y simplemente no tienen
-- motivo registrado, que es lo correcto — nadie se los pidio en su momento.

ALTER TABLE "appointments" ADD COLUMN "canceladaAt" TIMESTAMP(3);
ALTER TABLE "appointments" ADD COLUMN "canceladaPorId" TEXT;
ALTER TABLE "appointments" ADD COLUMN "cancelacionMotivo" TEXT;
ALTER TABLE "appointments" ADD COLUMN "consultaTipo" TEXT;
ALTER TABLE "appointments" ADD COLUMN "motivoConsulta" TEXT;

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_canceladaPorId_fkey"
  FOREIGN KEY ("canceladaPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
