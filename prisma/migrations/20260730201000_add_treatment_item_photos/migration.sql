CREATE TABLE "treatment_item_photos" (
    "id" TEXT NOT NULL,
    "treatmentItemId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicaId" TEXT NOT NULL,

    CONSTRAINT "treatment_item_photos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "treatment_item_photos_clinicaId_idx" ON "treatment_item_photos"("clinicaId");

CREATE INDEX "treatment_item_photos_treatmentItemId_idx" ON "treatment_item_photos"("treatmentItemId");

ALTER TABLE "treatment_item_photos" ADD CONSTRAINT "treatment_item_photos_treatmentItemId_fkey" FOREIGN KEY ("treatmentItemId") REFERENCES "treatment_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "treatment_item_photos" ADD CONSTRAINT "treatment_item_photos_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
