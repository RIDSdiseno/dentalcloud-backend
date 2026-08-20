-- AlterTable
ALTER TABLE "users" ADD COLUMN "federatedUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_federatedUserId_key" ON "users"("federatedUserId");
