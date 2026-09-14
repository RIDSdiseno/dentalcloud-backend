-- CreateTable
CREATE TABLE "productos_marca" (
    "id" TEXT NOT NULL,
    "clinicaId" TEXT NOT NULL,
    "nombreGenerico" TEXT NOT NULL,
    "marca" TEXT NOT NULL,
    "unidad" TEXT NOT NULL DEFAULT 'unidad',
    "costo" INTEGER NOT NULL DEFAULT 0,
    "margenPercent" INTEGER NOT NULL DEFAULT 0,
    "precioVenta" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "productos_marca_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "productos_marca_clinicaId_nombreGenerico_marca_key" ON "productos_marca"("clinicaId", "nombreGenerico", "marca");

ALTER TABLE "productos_marca" ADD CONSTRAINT "productos_marca_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "treatment_items" ADD COLUMN "productoMarcaId" TEXT;
ALTER TABLE "treatment_items" ADD COLUMN "productUnitQuantity" INTEGER;

ALTER TABLE "treatment_items" ADD CONSTRAINT "treatment_items_productoMarcaId_fkey" FOREIGN KEY ("productoMarcaId") REFERENCES "productos_marca"("id") ON DELETE SET NULL ON UPDATE CASCADE;
