-- AlterTable
ALTER TABLE "clinicas" ADD COLUMN     "modules" JSONB NOT NULL DEFAULT '{"documentosClinicos": true, "cartola": true, "evoluciones": true, "observaciones": true}';

