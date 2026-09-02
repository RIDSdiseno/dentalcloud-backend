import type { Request, Response } from 'express';
import prisma from '../lib/prisma';
import cloudinary from '../lib/cloudinary';
import { cleanRut, isValidRut } from '../utils/rut';
import { ALLERGY_KEYS } from '../lib/allergies';
import { fetchPrivacyConsentSummaries, fetchPrivacyConsentSummary, withPrivacyConsentSummary } from '../lib/privacyConsentSummary';
import { syncPatientToDimageIfNeeded } from '../lib/dimagePatientSync';
import { syncPatientToFederation } from '../lib/federationSync';

type PatientInput = {
  rut?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  birthDate?: string;
  address?: string;
  gender?: string;
  nationality?: string;
  maritalStatus?: string;
  occupation?: string;
  heightCm?: number | null;
  weightKg?: number | null;
  allergies?: string[];
  allergyNotes?: string;
  medicalConditions?: string;
  currentMedications?: string;
  chronicDiseases?: string;
  dentalHistory?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
  healthInsurance?: string;
  healthInsuranceDetail?: string;
  bloodType?: string;
  tags?: string[];
};

function sanitizeAllergies(allergies?: string[]): string[] | undefined {
  if (allergies === undefined) return undefined;
  if (!Array.isArray(allergies)) return [];
  const validKeys: readonly string[] = ALLERGY_KEYS;
  return allergies.filter((a) => typeof a === 'string' && validKeys.includes(a));
}

function sanitizeTags(tags?: string[]): string[] | undefined {
  if (tags === undefined) return undefined;
  if (!Array.isArray(tags)) return [];
  const cleaned = tags
    .filter((t) => typeof t === 'string')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 20);
  return [...new Set(cleaned)];
}

function toPatientData(body: PatientInput) {
  return {
    firstName: body.firstName!.trim(),
    lastName: body.lastName!.trim(),
    phone: body.phone?.trim() || null,
    email: body.email?.trim() || null,
    birthDate: body.birthDate ? new Date(body.birthDate) : null,
    address: body.address?.trim() || null,
    gender: body.gender?.trim() || null,
    nationality: body.nationality?.trim() || null,
    maritalStatus: body.maritalStatus?.trim() || null,
    occupation: body.occupation?.trim() || null,
    heightCm: body.heightCm != null ? Math.round(body.heightCm) : null,
    weightKg: body.weightKg != null ? body.weightKg : null,
    allergies: sanitizeAllergies(body.allergies) ?? [],
    allergyNotes: body.allergyNotes?.trim() || null,
    medicalConditions: body.medicalConditions?.trim() || null,
    currentMedications: body.currentMedications?.trim() || null,
    chronicDiseases: body.chronicDiseases?.trim() || null,
    dentalHistory: body.dentalHistory?.trim() || null,
    emergencyContactName: body.emergencyContactName?.trim() || null,
    emergencyContactPhone: body.emergencyContactPhone?.trim() || null,
    emergencyContactRelationship: body.emergencyContactRelationship?.trim() || null,
    healthInsurance: body.healthInsurance?.trim() || null,
    healthInsuranceDetail: body.healthInsuranceDetail?.trim() || null,
    bloodType: body.bloodType?.trim() || null,
    tags: sanitizeTags(body.tags) ?? [],
  };
}

function toPatientPatch(body: PatientInput) {
  const patch: Record<string, unknown> = {};
  if (body.firstName !== undefined) patch.firstName = body.firstName.trim();
  if (body.lastName !== undefined) patch.lastName = body.lastName.trim();
  if (body.phone !== undefined) patch.phone = body.phone.trim() || null;
  if (body.email !== undefined) patch.email = body.email.trim() || null;
  if (body.birthDate !== undefined) patch.birthDate = body.birthDate ? new Date(body.birthDate) : null;
  if (body.address !== undefined) patch.address = body.address.trim() || null;
  if (body.gender !== undefined) patch.gender = body.gender.trim() || null;
  if (body.nationality !== undefined) patch.nationality = body.nationality.trim() || null;
  if (body.maritalStatus !== undefined) patch.maritalStatus = body.maritalStatus.trim() || null;
  if (body.occupation !== undefined) patch.occupation = body.occupation.trim() || null;
  if (body.heightCm !== undefined) patch.heightCm = body.heightCm != null ? Math.round(body.heightCm) : null;
  if (body.weightKg !== undefined) patch.weightKg = body.weightKg;
  if (body.allergies !== undefined) patch.allergies = sanitizeAllergies(body.allergies);
  if (body.allergyNotes !== undefined) patch.allergyNotes = body.allergyNotes.trim() || null;
  if (body.medicalConditions !== undefined) patch.medicalConditions = body.medicalConditions.trim() || null;
  if (body.currentMedications !== undefined) patch.currentMedications = body.currentMedications.trim() || null;
  if (body.chronicDiseases !== undefined) patch.chronicDiseases = body.chronicDiseases.trim() || null;
  if (body.dentalHistory !== undefined) patch.dentalHistory = body.dentalHistory.trim() || null;
  if (body.emergencyContactName !== undefined) patch.emergencyContactName = body.emergencyContactName.trim() || null;
  if (body.emergencyContactPhone !== undefined) patch.emergencyContactPhone = body.emergencyContactPhone.trim() || null;
  if (body.emergencyContactRelationship !== undefined) patch.emergencyContactRelationship = body.emergencyContactRelationship.trim() || null;
  if (body.healthInsurance !== undefined) patch.healthInsurance = body.healthInsurance.trim() || null;
  if (body.healthInsuranceDetail !== undefined) patch.healthInsuranceDetail = body.healthInsuranceDetail.trim() || null;
  if (body.bloodType !== undefined) patch.bloodType = body.bloodType.trim() || null;
  if (body.tags !== undefined) patch.tags = sanitizeTags(body.tags);
  return patch;
}

export async function list(req: Request, res: Response) {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const searchRut = cleanRut(search);
  const clinicaId = req.user!.clinicaId!;

  const patients = await prisma.patient.findMany({
    where: {
      clinicaId,
      ...(search
        ? {
            OR: [
              ...(searchRut ? [{ rut: { contains: searchRut, mode: 'insensitive' as const } }] : []),
              { firstName: { contains: search, mode: 'insensitive' as const } },
              { lastName: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: 50,
  });
  const summaries = await fetchPrivacyConsentSummaries(patients.map((p) => p.id));
  return res.json({ patients: patients.map((p) => withPrivacyConsentSummary(p, summaries)) });
}

export async function getOne(req: Request<{ id: string }>, res: Response) {
  const patient = await prisma.patient.findUnique({ where: { id: req.params.id } });
  if (!patient) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }
  const summary = await fetchPrivacyConsentSummary(patient.id);
  return res.json({ patient: { ...patient, ...summary } });
}

export async function create(req: Request, res: Response) {
  const body = req.body as PatientInput;

  if (!body.rut || !isValidRut(body.rut)) {
    return res.status(400).json({ error: 'El RUT ingresado no es válido' });
  }
  if (!body.firstName?.trim() || !body.lastName?.trim()) {
    return res.status(400).json({ error: 'Nombre y apellido son requeridos' });
  }

  const clinicaId = req.user!.clinicaId!;
  const rut = cleanRut(body.rut);
  const existing = await prisma.patient.findFirst({ where: { clinicaId, rut } });
  if (existing) {
    return res.status(409).json({ error: `Ya existe un paciente con el RUT ${rut}` });
  }

  const patient = await prisma.patient.create({ data: { rut, clinicaId, ...toPatientData(body) } });

  const clinica = await prisma.clinica.findUnique({ where: { id: clinicaId }, select: { rxEnabled: true } });
  if (clinica?.rxEnabled) {
    // Best-effort: si la clínica tiene el módulo Rx habilitado, el paciente
    // queda disponible en RIDS RX desde su creación (no solo al crear una
    // orden), para poder generar órdenes desde cualquiera de los dos sistemas.
    // No bloquea ni falla la creación del paciente si Dimage no responde.
    syncPatientToDimageIfNeeded(patient).catch((err) => {
      console.error('No se pudo sincronizar el paciente recién creado con RIDS RX', err);
    });
  }

  // Best-effort: si la clínica de este paciente está emparejada con
  // Dental-Demo-Back, lo espeja allá para que administración lo vea también.
  syncPatientToFederation(patient).catch((err) => {
    console.error('No se pudo sincronizar el paciente recién creado con Dental-Demo-Back', err);
  });

  return res.status(201).json({ patient });
}

export async function update(req: Request<{ id: string }>, res: Response) {
  const body = req.body as PatientInput;
  const patient = await prisma.patient.findUnique({ where: { id: req.params.id } });
  if (!patient) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }

  if (body.rut && !isValidRut(body.rut)) {
    return res.status(400).json({ error: 'El RUT ingresado no es válido' });
  }

  const updated = await prisma.patient.update({
    where: { id: req.params.id },
    data: {
      ...(body.rut ? { rut: cleanRut(body.rut) } : {}),
      ...toPatientPatch(body),
    },
  });

  syncPatientToFederation(updated).catch((err) => {
    console.error('No se pudo sincronizar la edición del paciente con Dental-Demo-Back', err);
  });

  return res.json({ patient: updated });
}

export async function uploadPhoto(req: Request<{ id: string }>, res: Response) {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'Se requiere un archivo de foto' });
  }

  const patient = await prisma.patient.findUnique({ where: { id: req.params.id } });
  if (!patient) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }

  const photo = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: 'image', folder: 'dentalcloud/patients/photos' },
      (error, result) => {
        if (error || !result) return reject(error);
        resolve({ secure_url: result.secure_url, public_id: result.public_id });
      }
    );
    stream.end(file.buffer);
  });

  if (patient.photoPublicId) {
    await cloudinary.uploader.destroy(patient.photoPublicId).catch(() => {
      // Best-effort: si la foto anterior ya no existe en Cloudinary o falla el
      // borrado, no bloquea la actualización de la nueva foto.
    });
  }

  const updated = await prisma.patient.update({
    where: { id: req.params.id },
    data: { photoUrl: photo.secure_url, photoPublicId: photo.public_id },
  });

  return res.json({ patient: updated });
}
