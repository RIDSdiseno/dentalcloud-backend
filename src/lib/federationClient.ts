import axios from 'axios';

export function isFederationConfigured() {
  return Boolean(process.env.DENTALDEMO_API_URL && process.env.FEDERATION_API_KEY);
}

const dentalDemo = axios.create({
  baseURL: process.env.DENTALDEMO_API_URL,
  headers: { 'X-API-KEY': process.env.FEDERATION_API_KEY ?? '' },
  timeout: 15000,
});

export type RemoteClinic = {
  id: string;
  name: string;
  status: string;
  country: string;
  createdAt: string;
};

export type RemotePatient = {
  id: string;
  firstName: string;
  lastName: string;
  rut: string | null;
  createdAt: string;
  clinicId: string;
  clinicName: string;
};

export type RemoteAppointment = {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  clinicId: string;
  clinicName: string;
  patientName: string;
};

export async function fetchRemoteClinics() {
  const { data } = await dentalDemo.get<{ clinics: RemoteClinic[] }>('/api/platform/clinics');
  return data.clinics;
}

export async function fetchRemotePatients() {
  const { data } = await dentalDemo.get<{ patients: RemotePatient[] }>('/api/platform/patients');
  return data.patients;
}

export async function fetchRemoteAppointments() {
  const { data } = await dentalDemo.get<{ appointments: RemoteAppointment[] }>('/api/platform/appointments');
  return data.appointments;
}

export type RemoteSupplyLot = {
  id: string;
  supplyId: string;
  productName: string | null;
  lotNumber: string;
  expiresAt: string | null;
  stock: number;
};

// clinicaId es el id nativo de esta plataforma (DentalCloud) — Dental-Demo-Back
// lo traduce a su clinicId local vía Clinic.federatedClinicaId, el mismo par
// que ya usa mirrorClinicToDentalDemo/mirrorClinic.
export async function fetchRemoteSupplyLots(clinicaId: string, search: string) {
  const { data } = await dentalDemo.get<{ lots: RemoteSupplyLot[] }>('/api/platform/federated/supply-lots', {
    params: { clinicaId, search },
  });
  return data.lots;
}

export type MirrorClinicInput = {
  externalId: string;
  name: string;
  pais?: string | null;
  // Tipo de clínica (dental/estetica/ambas) traducido a lo que espera
  // Dental-Demo ("DENTAL"/"ESTHETIC"/"BOTH") — dirección inversa del mismo
  // dato que Dental-Demo nos manda cuando la clínica nace del otro lado.
  clinicType?: 'DENTAL' | 'ESTHETIC' | 'BOTH';
  adminName?: string | null;
  adminEmail?: string | null;
  adminPassword?: string | null;
  active?: boolean;
};

export type MirrorPatientInput = {
  clinicId: string;
  externalId: string;
  firstName: string;
  lastName: string;
  rut?: string | null;
  email?: string | null;
  phone?: string | null;
  birthDate?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  allergies?: string[];
  allergyNotes?: string | null;
  medicalConditions?: string | null;
  currentMedications?: string | null;
};

export type MirrorAppointmentInput = {
  clinicId: string;
  patientId: string;
  externalId: string;
  startAt: string;
  endAt: string;
  status: string;
  notes?: string | null;
  // Dental-Demo-Back no federa cuentas de profesional (no hay User real del
  // otro lado) — se manda solo el nombre, como dato informativo, igual que
  // ya se hace para TreatmentPlan.
  professionalName?: string | null;
  // Sillón/box asignado en DentalCloud (no hay federación de recursos
  // físicos), viaja como texto ("Sillón 2", o el nombre propio del sillón).
  box?: string | null;
};

export async function mirrorClinicToDentalDemo(input: MirrorClinicInput) {
  const { data } = await dentalDemo.post<{ id: string }>('/api/platform/federated/clinics/mirror', input);
  return data;
}

export async function mirrorPatientToDentalDemo(input: MirrorPatientInput) {
  const { data } = await dentalDemo.post<{ id: string }>('/api/platform/federated/patients/mirror', input);
  return data;
}

export async function mirrorAppointmentToDentalDemo(input: MirrorAppointmentInput) {
  const { data } = await dentalDemo.post<{ id: string }>('/api/platform/federated/appointments/mirror', input);
  return data;
}

export type MirrorTreatmentPlanInput =
  | {
      patientId: string;
      externalId: string;
      title: string;
      description?: string | null;
      status?: string | null;
      agreementId?: string;
      previsionId?: string;
      professionalName?: string;
      // 'DENTAL' | 'ESTHETIC' — mismo vocabulario que Dental-Demo-Back's
      // TreatmentPlanType enum, derivado de TreatmentPlan.diagramType
      // ('dental'|'estetica') del lado de DentalCloud.
      planType?: 'DENTAL' | 'ESTHETIC';
      // Género elegido para el mapa facial (TreatmentPlan.facialGender) — sin
      // esto Dental-Demo no sabe qué imagen (hombre/mujer) usar para dibujar
      // las zonas tratadas en su propio mapa facial de solo lectura.
      facialGender?: string | null;
      // Trazos a mano alzada del mapa facial (lápiz/línea/círculo) — se
      // replican tal cual (mismo shape que FacialAnnotations en
      // facialZoneConfig.ts) para que Dental-Demo los dibuje de solo lectura.
      facialAnnotations?: unknown;
    }
  | { externalId: string; removed: true };

export type MirrorTreatmentItemInput = {
  treatmentPlanId: string;
  externalId: string;
  name?: string;
  description?: string | null;
  tooth?: string | null;
  unitPrice?: number;
  completed?: boolean;
  removed?: boolean;
  prestacionId?: string;
  listPrice?: number;
  convenioDiscountPercent?: number;
  productName?: string;
  productLot?: string;
  productExpiresAt?: string;
  productQuantity?: string;
};

export async function mirrorTreatmentPlanToDentalDemo(input: MirrorTreatmentPlanInput) {
  const { data } = await dentalDemo.post<{ id: string }>('/api/platform/federated/treatment-plans/mirror', input);
  return data;
}

export async function mirrorTreatmentItemToDentalDemo(input: MirrorTreatmentItemInput) {
  const { data } = await dentalDemo.post<{ id: string }>('/api/platform/federated/treatment-plans/items/mirror', input);
  return data;
}

// Fotos del procedimiento — solo lectura del lado de Dental-Demo (se suben y
// borran exclusivamente acá, donde vive Cloudinary). `treatmentItemId` va ya
// traducido al id local del otro lado (item.federatedTreatmentItemId), mismo
// criterio que treatmentPlanId en MirrorTreatmentItemInput.
export type MirrorTreatmentItemPhotoInput =
  | { treatmentItemId: string; externalId: string; url: string; label?: string | null }
  | { externalId: string; removed: true };

export async function mirrorTreatmentItemPhotoToDentalDemo(input: MirrorTreatmentItemPhotoInput) {
  const { data } = await dentalDemo.post<{ id: string | null }>(
    '/api/platform/federated/treatment-plans/items/photos/mirror',
    input
  );
  return data;
}

export type MirrorConvenioInput = {
  clinicId: string;
  externalId: string;
  name: string;
  discountPercent: number;
  active: boolean;
};

export type MirrorPrestacionInput = {
  clinicId: string;
  externalId: string;
  name: string;
  code?: string | null;
  basePrice: number;
  active: boolean;
  // Sólo se manda cuando la prestación es dental — indefinido para
  // prestaciones estéticas (usan zonas faciales, no odontograma).
  odontogramMode?: string;
  requiresProductTracking?: boolean;
};

export type MirrorPrevisionInput = {
  clinicId: string;
  externalId: string;
  name: string;
  active: boolean;
};

export async function mirrorConvenioToDentalDemo(input: MirrorConvenioInput) {
  const { data } = await dentalDemo.post<{ id: string }>('/api/platform/federated/agreements/mirror', input);
  return data;
}

export async function mirrorPrestacionToDentalDemo(input: MirrorPrestacionInput) {
  const { data } = await dentalDemo.post<{ id: string }>('/api/platform/federated/prestaciones/mirror', input);
  return data;
}

export async function mirrorPrevisionToDentalDemo(input: MirrorPrevisionInput) {
  const { data } = await dentalDemo.post<{ id: string }>('/api/platform/federated/previsiones/mirror', input);
  return data;
}

export type MirrorUserInput = {
  clinicId: string;
  externalId: string;
  name: string;
  email: string;
  // Sólo viaja en el intento original (mismo momento en que ya está en texto
  // plano localmente, antes de hashearla) — un reintento posterior ya no la
  // tiene y el otro lado genera una temporal (ver federationSync.ts).
  password?: string | null;
  role: string;
  rut?: string | null;
  active?: boolean;
};

export async function mirrorUserToDentalDemo(input: MirrorUserInput) {
  const { data } = await dentalDemo.post<{ id: string }>('/api/platform/federated/users/mirror', input);
  return data;
}

// Inventario (ClinicSupply/ClinicSupplyLot en Dental-Demo-Back) — a
// diferencia de todo lo demás en este archivo, no es un mirror (no vive
// duplicado acá): DentalCloud lee/escribe en vivo el inventario real que
// administra Dental-Demo-Back. clinicaId/sucursalId siempre van en el
// vocabulario nativo de esta plataforma; el otro lado los traduce vía
// Clinic.federatedClinicaId / Location.federatedLocationId.
export type RemoteInventorySupply = {
  id: string;
  clinicId: string;
  locationId: string | null;
  name: string;
  category: string | null;
  supplier: string | null;
  consultingRoom: string | null;
  description: string | null;
  purchaseDate: string | null;
  quantity: number | null;
  unit: string | null;
  unitCost: number | null;
  totalCost: number | null;
  currentStock: number | null;
  minimumStock: number | null;
  status: 'ACTIVE' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'ARCHIVED';
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  location: { id: string; name: string } | null;
  lotSummary?: {
    totalLots: number;
    activeLots: number;
    totalQuantity: number;
    expiredLots: number;
    expiringLots: number;
    nextExpirationDate: string | null;
  };
};

export type RemoteInventoryLot = {
  id: string;
  supplyId: string;
  locationId: string | null;
  lotNumber: string;
  manufacturer: string | null;
  presentation: string | null;
  concentration: string | null;
  healthRegistration: string | null;
  quantity: number;
  initialQuantity: number;
  currentQuantity: number;
  expirationDate: string | null;
  receivedAt: string | null;
  expirationStatus: 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'NO_EXPIRATION';
  expirationStatusLabel: string;
  daysUntilExpiration: number | null;
  isActive: boolean;
  location: { id: string; name: string } | null;
  supply?: { id: string; name: string; status: string; currentStock: number | null; minimumStock: number | null };
};

export type RemoteInventoryMovement = {
  id: string;
  movementType: 'IN' | 'OUT' | 'ADJUSTMENT';
  quantity: number;
  previousQuantity: number;
  resultingQuantity: number;
  reason: string | null;
  createdAt: string;
};

export type RemoteInventoryAlerts = {
  expiredLots: number;
  expiringLots: number;
  suppliesWithoutStock: number;
  lowStockSupplies: number;
  items: RemoteInventoryLot[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

export type InventorySupplyFilters = {
  search?: string;
  category?: string;
  supplier?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  sucursalId?: string;
  consultingRoom?: string;
  page?: number;
  limit?: number;
};

export type InventorySupplyInput = {
  sucursalId?: string;
  name: string;
  category?: string;
  supplier?: string;
  description?: string;
  purchaseDate?: string;
  quantity?: number;
  unit?: string;
  unitCost?: number;
  totalCost?: number;
  currentStock?: number;
  minimumStock?: number;
  consultingRoom?: string | null;
};

export type InventoryLotFilters = {
  sucursalId?: string;
  search?: string;
  expirationStatus?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  active?: boolean;
  page?: number;
  limit?: number;
};

export type InventoryLotInput = {
  lotNumber: string;
  manufacturer?: string | null;
  presentation?: string | null;
  concentration?: string | null;
  healthRegistration?: string | null;
  receivedAt?: string;
  expirationDate?: string | null;
  initialQuantity?: number;
  quantity?: number;
  isActive?: boolean;
};

export type InventoryLotMovementInput = {
  movementType: 'IN' | 'OUT' | 'ADJUSTMENT';
  quantity: number;
  reason?: string | null;
};

export type InventoryAlertsFilters = {
  sucursalId?: string;
  includeItems?: boolean;
  expirationStatus?: string;
  active?: boolean;
  page?: number;
  limit?: number;
};

export async function fetchRemoteInventorySupplies(clinicaId: string, filters: InventorySupplyFilters = {}) {
  const { data } = await dentalDemo.get<{ ok: boolean; data: { items: RemoteInventorySupply[]; pagination: unknown } }>(
    '/api/platform/federated/inventory/supplies',
    { params: { clinicaId, ...filters } }
  );
  return data.data;
}

export async function fetchRemoteInventorySupply(clinicaId: string, supplyId: string) {
  const { data } = await dentalDemo.get<{ ok: boolean; data: RemoteInventorySupply }>(
    `/api/platform/federated/inventory/supplies/${supplyId}`,
    { params: { clinicaId } }
  );
  return data.data;
}

export async function createRemoteInventorySupply(clinicaId: string, input: InventorySupplyInput) {
  const { data } = await dentalDemo.post<{ ok: boolean; data: RemoteInventorySupply }>(
    '/api/platform/federated/inventory/supplies',
    { clinicaId, ...input }
  );
  return data.data;
}

export async function updateRemoteInventorySupply(
  clinicaId: string,
  supplyId: string,
  patch: Partial<InventorySupplyInput>
) {
  const { data } = await dentalDemo.patch<{ ok: boolean; data: RemoteInventorySupply }>(
    `/api/platform/federated/inventory/supplies/${supplyId}`,
    { clinicaId, ...patch }
  );
  return data.data;
}

export async function archiveRemoteInventorySupply(clinicaId: string, supplyId: string) {
  const { data } = await dentalDemo.post<{ ok: boolean; data: RemoteInventorySupply }>(
    `/api/platform/federated/inventory/supplies/${supplyId}/archive`,
    { clinicaId }
  );
  return data.data;
}

export async function fetchRemoteInventoryLots(clinicaId: string, supplyId: string, filters: InventoryLotFilters = {}) {
  const { data } = await dentalDemo.get<{ ok: boolean; data: { items: RemoteInventoryLot[]; pagination: unknown } }>(
    `/api/platform/federated/inventory/supplies/${supplyId}/lots`,
    { params: { clinicaId, ...filters } }
  );
  return data.data;
}

export async function createRemoteInventoryLot(clinicaId: string, supplyId: string, input: InventoryLotInput) {
  const { data } = await dentalDemo.post<{ ok: boolean; data: RemoteInventoryLot }>(
    `/api/platform/federated/inventory/supplies/${supplyId}/lots`,
    { clinicaId, ...input }
  );
  return data.data;
}

export async function updateRemoteInventoryLot(
  clinicaId: string,
  supplyId: string,
  lotId: string,
  patch: Partial<InventoryLotInput>
) {
  const { data } = await dentalDemo.patch<{ ok: boolean; data: RemoteInventoryLot }>(
    `/api/platform/federated/inventory/supplies/${supplyId}/lots/${lotId}`,
    { clinicaId, ...patch }
  );
  return data.data;
}

export async function createRemoteInventoryLotMovement(
  clinicaId: string,
  supplyId: string,
  lotId: string,
  input: InventoryLotMovementInput
) {
  const { data } = await dentalDemo.post<{
    ok: boolean;
    data: { movement: RemoteInventoryMovement; lot: RemoteInventoryLot; supply: RemoteInventorySupply };
  }>(`/api/platform/federated/inventory/supplies/${supplyId}/lots/${lotId}/movements`, { clinicaId, ...input });
  return data.data;
}

export async function fetchRemoteInventoryAlerts(clinicaId: string, filters: InventoryAlertsFilters = {}) {
  const { data } = await dentalDemo.get<{ ok: boolean; data: RemoteInventoryAlerts }>(
    '/api/platform/federated/inventory/alerts',
    { params: { clinicaId, ...filters } }
  );
  return data.data;
}

export type MirrorSucursalInput = {
  clinicId: string;
  externalId: string;
  name: string;
  country?: string | null;
  active?: boolean;
};

export async function mirrorSucursalToDentalDemo(input: MirrorSucursalInput) {
  const { data } = await dentalDemo.post<{ id: string }>('/api/platform/federated/locations/mirror', input);
  return data;
}

export default dentalDemo;
