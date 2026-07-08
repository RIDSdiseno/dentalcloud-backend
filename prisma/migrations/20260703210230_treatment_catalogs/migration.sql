-- AlterTable
ALTER TABLE "treatment_items" ADD COLUMN     "convenioDiscountPercent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "listPrice" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "prestacionId" TEXT,
ADD COLUMN     "toothNumber" TEXT;

-- AlterTable
ALTER TABLE "treatment_plans" ADD COLUMN     "convenioId" TEXT,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "paymentMethod" TEXT,
ADD COLUMN     "previsionId" TEXT,
ADD COLUMN     "sucursalId" TEXT;

-- CreateTable
CREATE TABLE "sucursales" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sucursales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "previsiones" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "previsiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "convenios" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "discountPercent" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "convenios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prestaciones" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "basePrice" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prestaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "previsiones_name_key" ON "previsiones"("name");

-- CreateIndex
CREATE UNIQUE INDEX "convenios_name_key" ON "convenios"("name");

-- CreateIndex
CREATE UNIQUE INDEX "prestaciones_code_key" ON "prestaciones"("code");

-- AddForeignKey
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_previsionId_fkey" FOREIGN KEY ("previsionId") REFERENCES "previsiones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_convenioId_fkey" FOREIGN KEY ("convenioId") REFERENCES "convenios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_items" ADD CONSTRAINT "treatment_items_prestacionId_fkey" FOREIGN KEY ("prestacionId") REFERENCES "prestaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
