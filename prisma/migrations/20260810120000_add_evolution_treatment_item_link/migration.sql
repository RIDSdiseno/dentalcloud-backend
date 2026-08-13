ALTER TABLE "evolutions" ADD COLUMN "treatmentItemId" TEXT;

CREATE INDEX "evolutions_treatmentItemId_idx" ON "evolutions"("treatmentItemId");

ALTER TABLE "evolutions" ADD CONSTRAINT "evolutions_treatmentItemId_fkey" FOREIGN KEY ("treatmentItemId") REFERENCES "treatment_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
