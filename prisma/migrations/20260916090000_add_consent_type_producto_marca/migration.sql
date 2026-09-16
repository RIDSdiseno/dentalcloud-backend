-- AlterTable
ALTER TABLE "consent_types" ADD COLUMN "productoMarcaId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "consent_types_productoMarcaId_key" ON "consent_types"("productoMarcaId");
