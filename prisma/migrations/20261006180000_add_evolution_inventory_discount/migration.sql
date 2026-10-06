-- La evolución pasa a descontar del inventario real.
-- Los campos de texto que ya existían (productName/productLot/...) se quedan
-- como están: son lo que se muestra. Estos cuatro son lo que permite descontar.
--
-- Todas son columnas nuevas y anulables, sin DEFAULT: en PostgreSQL 11+ esto
-- es sólo metadata, no reescribe la tabla ni bloquea lecturas. Las evoluciones
-- ya existentes quedan con NULL, que es lo correcto: nunca descontaron nada.
ALTER TABLE "evolutions" ADD COLUMN "productLotId" TEXT;
ALTER TABLE "evolutions" ADD COLUMN "productSupplyId" TEXT;
ALTER TABLE "evolutions" ADD COLUMN "productQuantityUsed" DOUBLE PRECISION;
ALTER TABLE "evolutions" ADD COLUMN "inventoryDiscountedAt" TIMESTAMP(3);
