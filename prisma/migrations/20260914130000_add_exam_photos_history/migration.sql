-- CreateTable
CREATE TABLE "exam_photos" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "clinicaId" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "moment" TEXT NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "url" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_photos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "exam_photos_patientId_moment_round_idx" ON "exam_photos"("patientId", "moment", "round");

CREATE INDEX "exam_photos_clinicaId_idx" ON "exam_photos"("clinicaId");

ALTER TABLE "exam_photos" ADD CONSTRAINT "exam_photos_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exam_photos" ADD CONSTRAINT "exam_photos_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: las fotos ya tomadas con el esquema viejo (un solo campo por
-- ángulo en "patients") pasan a ser la ronda 1 de "antes", para no perder lo
-- que los médicos ya cargaron antes de este cambio.
INSERT INTO "exam_photos" ("id", "patientId", "clinicaId", "slot", "moment", "round", "url", "publicId", "createdAt")
SELECT gen_random_uuid(), "id", "clinicaId", 'frontal', 'antes', 1, "examPhotoFrontalUrl", '', "updatedAt"
FROM "patients" WHERE "examPhotoFrontalUrl" IS NOT NULL;

INSERT INTO "exam_photos" ("id", "patientId", "clinicaId", "slot", "moment", "round", "url", "publicId", "createdAt")
SELECT gen_random_uuid(), "id", "clinicaId", 'perfilDerecho', 'antes', 1, "examPhotoPerfilDerechoUrl", '', "updatedAt"
FROM "patients" WHERE "examPhotoPerfilDerechoUrl" IS NOT NULL;

INSERT INTO "exam_photos" ("id", "patientId", "clinicaId", "slot", "moment", "round", "url", "publicId", "createdAt")
SELECT gen_random_uuid(), "id", "clinicaId", '45derecha', 'antes', 1, "examPhoto45DerechaUrl", '', "updatedAt"
FROM "patients" WHERE "examPhoto45DerechaUrl" IS NOT NULL;

INSERT INTO "exam_photos" ("id", "patientId", "clinicaId", "slot", "moment", "round", "url", "publicId", "createdAt")
SELECT gen_random_uuid(), "id", "clinicaId", '45izquierda', 'antes', 1, "examPhoto45IzquierdaUrl", '', "updatedAt"
FROM "patients" WHERE "examPhoto45IzquierdaUrl" IS NOT NULL;
