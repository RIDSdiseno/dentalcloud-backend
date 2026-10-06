-- Valoriza el insumo consumido en cada atención.
-- Es una foto del precio al momento de atender: si mañana cambia el costo del
-- lote, lo que costó esta atención no cambia.
--
-- Esto NO genera un gasto nuevo. La plata ya se contó como gasto al comprar el
-- insumo; contarla otra vez al consumirlo la duplicaría. Sirve para saber
-- cuánto costó atender a cada paciente.
ALTER TABLE "evolutions" ADD COLUMN "productUnitCost" INTEGER;
ALTER TABLE "evolutions" ADD COLUMN "productTotalCost" INTEGER;
