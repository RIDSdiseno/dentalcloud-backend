ALTER TABLE "users" ADD COLUMN "federatedUserId" TEXT;
CREATE UNIQUE INDEX "users_federatedUserId_key" ON "users"("federatedUserId");
