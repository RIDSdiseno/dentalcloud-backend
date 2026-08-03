-- AlterTable
ALTER TABLE "clinicas" ADD COLUMN "rolePermissions" JSONB NOT NULL DEFAULT '{}';
