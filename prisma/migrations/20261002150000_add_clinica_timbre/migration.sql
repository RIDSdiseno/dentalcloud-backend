-- Timbre/sello de la clinica (reunion 30/09, tarea 15).
--
-- Cada clinica sube el suyo en Configuracion > Compania; se imprime como
-- marca de agua grande y tenue detras del contenido de la cartola, la receta
-- y el consentimiento. Es distinto del logo, que va en el encabezado.
--
-- Aditivo y nullable: las clinicas existentes quedan sin timbre y sus PDF
-- salen exactamente igual que hoy, hasta que suban uno.

ALTER TABLE "clinicas" ADD COLUMN "timbreUrl" TEXT;
ALTER TABLE "clinicas" ADD COLUMN "timbrePublicId" TEXT;
