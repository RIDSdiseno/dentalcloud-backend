ALTER TABLE "evolutions"
  ADD COLUMN "productName" TEXT,
  ADD COLUMN "productLot" TEXT,
  ADD COLUMN "productExpiresAt" TIMESTAMP(3),
  ADD COLUMN "productQuantity" TEXT;

CREATE TABLE "evolution_photos" (
    "id" TEXT NOT NULL,
    "evolutionId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicaId" TEXT NOT NULL,

    CONSTRAINT "evolution_photos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "evolution_photos_clinicaId_idx" ON "evolution_photos"("clinicaId");
CREATE INDEX "evolution_photos_evolutionId_idx" ON "evolution_photos"("evolutionId");

ALTER TABLE "evolution_photos" ADD CONSTRAINT "evolution_photos_evolutionId_fkey" FOREIGN KEY ("evolutionId") REFERENCES "evolutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evolution_photos" ADD CONSTRAINT "evolution_photos_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
