ALTER TABLE "treatment_items"
  ADD COLUMN "productName" TEXT,
  ADD COLUMN "productLot" TEXT,
  ADD COLUMN "productExpiresAt" TIMESTAMP(3),
  ADD COLUMN "productQuantity" TEXT;
