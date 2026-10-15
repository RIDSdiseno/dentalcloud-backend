-- Nº de colegiado del profesional (obligatorio en recetas de España).
-- Opcional: en Chile no aplica. No rompe datos existentes (columna nullable).
ALTER TABLE "users" ADD COLUMN "colegiado" TEXT;
