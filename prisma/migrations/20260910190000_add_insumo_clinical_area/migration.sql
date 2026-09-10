-- CreateEnum
CREATE TYPE "InsumoClinicalArea" AS ENUM ('DENTAL', 'ESTHETIC', 'BOTH');

-- AlterTable
ALTER TABLE "insumo_supplies" ADD COLUMN "clinicalArea" "InsumoClinicalArea" NOT NULL DEFAULT 'DENTAL';
