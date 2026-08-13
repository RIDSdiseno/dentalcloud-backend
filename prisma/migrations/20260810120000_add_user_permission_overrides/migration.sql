-- AlterTable
ALTER TABLE "users" ADD COLUMN     "permissionOverrides" JSONB,
ADD COLUMN     "moduleOverrides" JSONB;
