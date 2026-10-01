-- Tipo de documento de identidad junto al número, para poder atender clínicas
-- fuera de Chile: hasta ahora todo se validaba como RUT y en España el paciente
-- tiene DNI o NIE, y la clínica un CIF.
--
-- Es puramente aditivo y con default 'RUT', así que todas las filas existentes
-- quedan con el valor correcto sin migrar nada a mano: lo que había guardado
-- hasta hoy ES un RUT chileno.
--
-- La columna del número sigue llamándose "rut" a propósito — la usan el
-- frontend, la federación con Dental-Demo y el Portal de Pacientes, y
-- renombrarla habría obligado a tocar los cuatro sistemas a la vez sin ganar
-- nada funcional.

ALTER TABLE "clinicas" ADD COLUMN "documentType" TEXT NOT NULL DEFAULT 'RUT';
ALTER TABLE "users" ADD COLUMN "documentType" TEXT NOT NULL DEFAULT 'RUT';
ALTER TABLE "patients" ADD COLUMN "documentType" TEXT NOT NULL DEFAULT 'RUT';
ALTER TABLE "consents" ADD COLUMN "signerDocumentType" TEXT NOT NULL DEFAULT 'RUT';
ALTER TABLE "consultation_payments" ADD COLUMN "documentType" TEXT NOT NULL DEFAULT 'RUT';
