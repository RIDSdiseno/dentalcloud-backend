-- Avances del Examen Estetico enlazados a una evolucion (reunion 30/09, tarea 18).
--
-- Tabla nueva, vacia: no toca ninguna fila existente. Guarda solo la
-- referencia al avance (registro + antes/avance + numero), no copia de fotos.

CREATE TABLE "evolution_exam_rounds" (
  "id"          TEXT NOT NULL,
  "evolutionId" TEXT NOT NULL,
  "source"      TEXT NOT NULL,
  "moment"      TEXT NOT NULL,
  "round"       INTEGER NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "clinicaId"   TEXT NOT NULL,

  CONSTRAINT "evolution_exam_rounds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "evolution_exam_rounds_evolutionId_source_moment_round_key"
  ON "evolution_exam_rounds"("evolutionId", "source", "moment", "round");

CREATE INDEX "evolution_exam_rounds_clinicaId_idx" ON "evolution_exam_rounds"("clinicaId");

ALTER TABLE "evolution_exam_rounds"
  ADD CONSTRAINT "evolution_exam_rounds_evolutionId_fkey"
  FOREIGN KEY ("evolutionId") REFERENCES "evolutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "evolution_exam_rounds"
  ADD CONSTRAINT "evolution_exam_rounds_clinicaId_fkey"
  FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
