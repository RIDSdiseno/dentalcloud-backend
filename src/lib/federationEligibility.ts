import prisma from './prisma';
import { isFederationConfigured } from './federationClient';

// Decide si esta clínica debe seguir usando el relay en vivo hacia
// Dental-Demo-Back (comportamiento sin cambios) o el inventario nativo de
// DentalCloud (fallback para clínicas que nunca se conectaron). Mismo
// criterio que ya usa el resto del código de federación para "¿esta clínica
// cuenta como conectada?" — ver federationSync.ts.
export async function isClinicaFederatedForInventory(clinicaId: string): Promise<boolean> {
  if (!isFederationConfigured()) return false;
  const clinica = await prisma.clinica.findUnique({
    where: { id: clinicaId },
    select: { federatedClinicId: true, federationPaused: true, federationCatalogOnly: true },
  });
  if (!clinica) return false;
  return Boolean(clinica.federatedClinicId) && !clinica.federationPaused && !clinica.federationCatalogOnly;
}
