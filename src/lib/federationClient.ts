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

export type MirrorClinicInput = {
  externalId: string;
  name: string;
  pais?: string | null;
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

export default dentalDemo;
