-- CreateEnum
CREATE TYPE "InsumoSupplyStatus" AS ENUM ('ACTIVE', 'LOW_STOCK', 'OUT_OF_STOCK', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "InsumoMovementType" AS ENUM ('IN', 'OUT', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "insumo_supplies" (
    "id" TEXT NOT NULL,
    "clinicaId" TEXT NOT NULL,
    "sucursalId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "supplier" TEXT,
    "consultingRoom" TEXT,
    "description" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "unitCost" INTEGER,
    "totalCost" INTEGER,
    "currentStock" DOUBLE PRECISION,
    "minimumStock" DOUBLE PRECISION,
    "status" "InsumoSupplyStatus" NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insumo_supplies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insumo_lots" (
    "id" TEXT NOT NULL,
    "clinicaId" TEXT NOT NULL,
    "supplyId" TEXT NOT NULL,
    "sucursalId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "lotNumber" TEXT NOT NULL,
    "manufacturer" TEXT,
    "presentation" TEXT,
    "concentration" TEXT,
    "healthRegistration" TEXT,
    "receivedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "initialQuantity" DOUBLE PRECISION NOT NULL,
    "currentQuantity" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insumo_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insumo_lot_movements" (
    "id" TEXT NOT NULL,
    "clinicaId" TEXT NOT NULL,
    "supplyId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "sucursalId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "movementType" "InsumoMovementType" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "previousQuantity" DOUBLE PRECISION NOT NULL,
    "resultingQuantity" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insumo_lot_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "insumo_supplies_clinicaId_idx" ON "insumo_supplies"("clinicaId");

-- CreateIndex
CREATE INDEX "insumo_supplies_clinicaId_sucursalId_idx" ON "insumo_supplies"("clinicaId", "sucursalId");

-- CreateIndex
CREATE INDEX "insumo_supplies_clinicaId_status_idx" ON "insumo_supplies"("clinicaId", "status");

-- CreateIndex
CREATE INDEX "insumo_lots_clinicaId_idx" ON "insumo_lots"("clinicaId");

-- CreateIndex
CREATE INDEX "insumo_lots_clinicaId_expiresAt_idx" ON "insumo_lots"("clinicaId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "insumo_lots_supplyId_lotNumber_key" ON "insumo_lots"("supplyId", "lotNumber");

-- CreateIndex
CREATE INDEX "insumo_lot_movements_clinicaId_idx" ON "insumo_lot_movements"("clinicaId");

-- CreateIndex
CREATE INDEX "insumo_lot_movements_lotId_createdAt_idx" ON "insumo_lot_movements"("lotId", "createdAt");

-- AddForeignKey
ALTER TABLE "insumo_supplies" ADD CONSTRAINT "insumo_supplies_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insumo_supplies" ADD CONSTRAINT "insumo_supplies_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insumo_supplies" ADD CONSTRAINT "insumo_supplies_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insumo_supplies" ADD CONSTRAINT "insumo_supplies_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insumo_lots" ADD CONSTRAINT "insumo_lots_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insumo_lots" ADD CONSTRAINT "insumo_lots_supplyId_fkey" FOREIGN KEY ("supplyId") REFERENCES "insumo_supplies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insumo_lots" ADD CONSTRAINT "insumo_lots_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insumo_lots" ADD CONSTRAINT "insumo_lots_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insumo_lots" ADD CONSTRAINT "insumo_lots_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insumo_lot_movements" ADD CONSTRAINT "insumo_lot_movements_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insumo_lot_movements" ADD CONSTRAINT "insumo_lot_movements_supplyId_fkey" FOREIGN KEY ("supplyId") REFERENCES "insumo_supplies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insumo_lot_movements" ADD CONSTRAINT "insumo_lot_movements_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "insumo_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insumo_lot_movements" ADD CONSTRAINT "insumo_lot_movements_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insumo_lot_movements" ADD CONSTRAINT "insumo_lot_movements_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
