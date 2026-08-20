-- AlterTable
ALTER TABLE "sucursales" ADD COLUMN "federatedSucursalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "sucursales_federatedSucursalId_key" ON "sucursales"("federatedSucursalId");
