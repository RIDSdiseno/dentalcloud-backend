import prisma from './prisma';

// Antes, el consentimiento de protección de datos vivía como columnas planas
// en Patient. Ahora es una fila más en la tabla genérica `consents` (tipo
// 'proteccion_datos'). Varias pantallas (lista de pacientes, stats de
// super-admin) siguen mostrando específicamente ese estado como columna/filtro
// rápido, así que este helper lo reconstruye con la misma forma que tenían
// antes los campos `privacyConsent*` de Patient.
export type PrivacyConsentSummary = {
  privacyConsentStatus: 'pendiente' | 'firmado' | 'rechazado' | 'expirado';
  privacyConsentMethod: string | null;
  privacyConsentSentAt: Date | null;
  privacyConsentExpiresAt: Date | null;
  privacyConsentAt: Date | null;
  privacyConsentSignerName: string | null;
  privacyConsentSignerRut: string | null;
};

const EMPTY_SUMMARY: PrivacyConsentSummary = {
  privacyConsentStatus: 'pendiente',
  privacyConsentMethod: null,
  privacyConsentSentAt: null,
  privacyConsentExpiresAt: null,
  privacyConsentAt: null,
  privacyConsentSignerName: null,
  privacyConsentSignerRut: null,
};

export async function fetchPrivacyConsentSummaries(
  patientIds: string[]
): Promise<Map<string, PrivacyConsentSummary>> {
  if (patientIds.length === 0) return new Map();
  const consents = await prisma.consent.findMany({
    where: { patientId: { in: patientIds }, consentType: { code: 'proteccion_datos' } },
    select: {
      patientId: true,
      status: true,
      method: true,
      sentAt: true,
      expiresAt: true,
      respondedAt: true,
      signerName: true,
      signerRut: true,
    },
  });
  const map = new Map<string, PrivacyConsentSummary>();
  for (const c of consents) {
    map.set(c.patientId, {
      privacyConsentStatus: c.status as PrivacyConsentSummary['privacyConsentStatus'],
      privacyConsentMethod: c.method,
      privacyConsentSentAt: c.sentAt,
      privacyConsentExpiresAt: c.expiresAt,
      privacyConsentAt: c.respondedAt,
      privacyConsentSignerName: c.signerName,
      privacyConsentSignerRut: c.signerRut,
    });
  }
  return map;
}

export async function fetchPrivacyConsentSummary(patientId: string): Promise<PrivacyConsentSummary> {
  const map = await fetchPrivacyConsentSummaries([patientId]);
  return map.get(patientId) ?? EMPTY_SUMMARY;
}

export function withPrivacyConsentSummary<T extends { id: string }>(
  patient: T,
  summaries: Map<string, PrivacyConsentSummary>
): T & PrivacyConsentSummary {
  return { ...patient, ...(summaries.get(patient.id) ?? EMPTY_SUMMARY) };
}
