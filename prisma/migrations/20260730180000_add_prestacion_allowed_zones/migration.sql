ALTER TABLE "prestaciones" ADD COLUMN "allowedZones" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
