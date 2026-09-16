import prisma from './prisma';

// Etapa 09 (16/09, pedido explícito de Urbina): "antes de empezar el
// tratamiento, hay que firmar el consentimiento, sí o sí" — y ese
// consentimiento es por PRODUCTO inyectado, no genérico. Este candado se usa
// en los dos lugares donde un TreatmentItem puede quedar marcado como
// `completed` (treatmentItemsController.update y evolutionsController.create)
// — nunca alcanza con que el frontend oculte el botón.
//
// Devuelve un mensaje de error si falta la firma, o `null` si puede seguir.
// Si el producto todavía no tiene un ConsentType vinculado (dato viejo, de
// antes de Etapa 09, o el auto-create best-effort falló), no bloquea — sería
// peor dejar un procedimiento congelado por un problema de datos que nadie
// puede resolver desde la pantalla de tratamiento.
export async function getUnsignedProductConsentError(
  patientId: string,
  productoMarcaId: string
): Promise<string | null> {
  const consentType = await prisma.consentType.findUnique({ where: { productoMarcaId } });
  if (!consentType) return null;

  const consent = await prisma.consent.findUnique({
    where: { patientId_consentTypeId: { patientId, consentTypeId: consentType.id } },
  });
  if (consent?.status === 'firmado') return null;

  return `Falta firmar el consentimiento "${consentType.name}" antes de registrar este tratamiento.`;
}
