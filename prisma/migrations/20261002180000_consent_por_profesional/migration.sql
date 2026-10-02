-- Consentimiento por doctor (reunion 30/09, tarea 16).
--
-- Un consentimiento clinico es por doctor: el paciente no consiente un
-- tratamiento en abstracto, consiente que se lo haga ESE profesional. Si lo
-- atiende otro, hay que firmar uno nuevo. Hasta ahora la base lo IMPEDIA:
-- habia una restriccion de "un paciente + un tipo = un solo consentimiento".
--
-- Los consentimientos ya firmados quedan con professionalId NULL y siguen
-- valiendo tal como se firmaron: nadie les pidio un doctor en su momento.

ALTER TABLE "consents" ADD COLUMN "professionalId" TEXT;
ALTER TABLE "consents" ADD COLUMN "professionalSignatureUrl" TEXT;

ALTER TABLE "consents"
  ADD CONSTRAINT "consents_professionalId_fkey"
  FOREIGN KEY ("professionalId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- La restriccion vieja impide el caso de uso entero. La nueva incluye al doctor.
-- Se suelta como CONSTRAINT y no como INDEX: Postgres no deja borrar el indice
-- que respalda una restriccion unica, hay que soltar la restriccion.
ALTER TABLE "consents" DROP CONSTRAINT IF EXISTS "consents_patientId_consentTypeId_key";
CREATE UNIQUE INDEX "consents_patientId_consentTypeId_professionalId_key"
  ON "consents"("patientId", "consentTypeId", "professionalId");

ALTER TABLE "consent_types" ADD COLUMN "porProfesional" BOOLEAN NOT NULL DEFAULT false;

-- Los tipos clinicos pasan a exigir doctor. Proteccion de datos, uso de
-- imagenes, grabacion de voz y autorizacion de representante quedan en false:
-- son de la clinica entera, se firman una sola vez.
UPDATE "consent_types" SET "porProfesional" = true
WHERE code IN (
  'tratamiento_general', 'anestesia', 'cirugia_procedimiento_invasivo', 'endodoncia',
  'protesis', 'ortodoncia', 'implantes', 'blanqueamiento', 'sedacion'
);

-- Los consentimientos de producto del catalogo tambien son clinicos.
UPDATE "consent_types" SET "porProfesional" = true WHERE "productoMarcaId" IS NOT NULL;
