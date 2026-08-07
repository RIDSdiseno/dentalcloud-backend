import type { Patient } from '@prisma/client';
import { formatRut } from '../utils/rut';
import { isDimageConfigured, findPatientByRut, upsertPatient } from './dimageClient';

// Crea (o vincula, si ya existía por RUT) el paciente en RIDS RX si todavía no
// existe ahí. No hace nada si Dimage no está configurado, o si el paciente ya
// existe — es idempotente y seguro de llamar en cualquier punto del flujo.
export async function syncPatientToDimageIfNeeded(patient: Patient): Promise<void> {
  if (!isDimageConfigured()) return;

  const rut = formatRut(patient.rut);
  const existing = await findPatientByRut(rut);
  if (existing) return;

  await upsertPatient({
    rut,
    name: `${patient.firstName} ${patient.lastName}`,
    email: patient.email,
    celphone: patient.phone,
    address: patient.address,
    dateofbirth: patient.birthDate ? patient.birthDate.toISOString().slice(0, 10) : null,
    id_externo: patient.id,
  });
}
