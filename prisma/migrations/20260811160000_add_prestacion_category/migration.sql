ALTER TABLE "prestaciones" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'dental';

-- Prestaciones que ya tienen zonas faciales asignadas son inequívocamente estéticas.
UPDATE "prestaciones" SET "category" = 'estetica' WHERE array_length("allowedZones", 1) > 0;

-- Clínicas puramente estéticas: todo su catálogo es estética.
UPDATE "prestaciones" p SET "category" = 'estetica'
  FROM "clinicas" c
  WHERE p."clinicaId" = c.id AND c.tipo = 'estetica';
