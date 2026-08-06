import bcrypt from 'bcrypt';
import type { Request, Response } from 'express';
import prisma from '../lib/prisma';
import cloudinary from '../lib/cloudinary';
import { parseClinicaModules, type ClinicaModuleKey } from '../lib/clinicaModules';
import { fetchPrivacyConsentSummaries } from '../lib/privacyConsentSummary';
import { cleanRut, isValidRut } from '../utils/rut';

export async function withStats() {
  const clinicas = await prisma.clinica.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: {
        select: {
          patients: true,
          users: true,
          appointments: true,
          treatmentPlans: true,
          clinicalDocuments: true,
          evolutions: true,
          administrativeObservations: true,
          ledgerMovements: true,
        },
      },
    },
  });

  const [amountsByClinica, ledgerByClinica, consentsByClinica] = await Promise.all([
    prisma.treatmentPlan.groupBy({ by: ['clinicaId'], _sum: { amount: true } }),
    prisma.ledgerMovement.groupBy({ by: ['clinicaId'], _sum: { debe: true, haber: true } }),
    prisma.consent.groupBy({
      by: ['clinicaId', 'status'],
      where: { consentType: { code: 'proteccion_datos' } },
      _count: { _all: true },
    }),
  ]);

  const amountByClinicaId = new Map(amountsByClinica.map((a) => [a.clinicaId, a._sum.amount ?? 0]));
  const ledgerByClinicaId = new Map(
    ledgerByClinica.map((l) => [l.clinicaId, { debe: l._sum.debe ?? 0, haber: l._sum.haber ?? 0 }])
  );
  // "pendiente" agrupa todo lo que no es firmado/rechazado, incluyendo los
  // pacientes sin ninguna fila de Consent todavía (nunca se les envió nada).
  const firmadoByClinicaId = new Map<string, number>();
  const rechazadoByClinicaId = new Map<string, number>();
  for (const row of consentsByClinica) {
    if (row.status === 'firmado') firmadoByClinicaId.set(row.clinicaId, row._count._all);
    else if (row.status === 'rechazado') rechazadoByClinicaId.set(row.clinicaId, row._count._all);
  }

  return clinicas.map((c) => ({
    id: c.id,
    name: c.name,
    rut: c.rut,
    active: c.active,
    tipo: c.tipo,
    pais: c.pais,
    logoUrl: c.logoUrl,
    rxEnabled: c.rxEnabled,
    modules: parseClinicaModules(c.modules),
    createdAt: c.createdAt,
    patientsCount: c._count.patients,
    usersCount: c._count.users,
    appointmentsCount: c._count.appointments,
    treatmentPlansCount: c._count.treatmentPlans,
    treatmentPlansAmount: amountByClinicaId.get(c.id) ?? 0,
    documentsCount: c._count.clinicalDocuments,
    evolutionsCount: c._count.evolutions,
    observationsCount: c._count.administrativeObservations,
    ledgerMovementsCount: c._count.ledgerMovements,
    ledgerNetAmount: (ledgerByClinicaId.get(c.id)?.haber ?? 0) - (ledgerByClinicaId.get(c.id)?.debe ?? 0),
    consentStats: (() => {
      const firmado = firmadoByClinicaId.get(c.id) ?? 0;
      const rechazado = rechazadoByClinicaId.get(c.id) ?? 0;
      return { firmado, rechazado, pendiente: Math.max(0, c._count.patients - firmado - rechazado) };
    })(),
  }));
}

export async function list(req: Request, res: Response) {
  return res.json({ clinicas: await withStats() });
}

const VALID_TIPOS = ['dental', 'estetica', 'ambas'];
const VALID_PAISES = [
  'Chile',
  'Argentina',
  'Perú',
  'Colombia',
  'México',
  'Bolivia',
  'Ecuador',
  'Uruguay',
  'Paraguay',
  'Venezuela',
  'España',
  'Estados Unidos',
  'Otro',
];

export async function create(req: Request, res: Response) {
  const { name, rut, tipo, pais, adminName, adminEmail, adminPassword } = req.body as {
    name?: string;
    rut?: string;
    tipo?: string;
    pais?: string;
    adminName?: string;
    adminEmail?: string;
    adminPassword?: string;
  };
  const file = req.file;

  if (!name?.trim()) {
    return res.status(400).json({ error: 'El nombre de la clínica es requerido' });
  }
  if (rut?.trim() && !isValidRut(rut)) {
    return res.status(400).json({ error: 'El RUT ingresado no es válido' });
  }
  if (tipo !== undefined && !VALID_TIPOS.includes(tipo)) {
    return res.status(400).json({ error: 'Tipo de clínica inválido' });
  }
  if (pais !== undefined && !VALID_PAISES.includes(pais)) {
    return res.status(400).json({ error: 'País inválido' });
  }
  if (!adminName?.trim() || !adminEmail?.trim() || !adminPassword) {
    return res.status(400).json({ error: 'Nombre, email y contraseña del administrador son requeridos' });
  }
  if (adminPassword.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  }

  const normalizedEmail = adminEmail.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return res.status(409).json({ error: `Ya existe un usuario con el email ${normalizedEmail}` });
  }

  const cleanedRut = rut?.trim() ? cleanRut(rut) : null;
  if (cleanedRut) {
    const existingRut = await prisma.clinica.findFirst({ where: { rut: cleanedRut } });
    if (existingRut) {
      return res.status(409).json({ error: `Ya existe una clínica con el RUT ${cleanedRut}` });
    }
  }

  let logo: { secure_url: string; public_id: string } | null = null;
  if (file) {
    logo = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type: 'image', folder: 'dentalcloud/clinicas/logos' },
        (error, result) => {
          if (error || !result) return reject(error);
          resolve({ secure_url: result.secure_url, public_id: result.public_id });
        }
      );
      stream.end(file.buffer);
    });
  }

  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const clinicaId = await prisma.$transaction(async (tx) => {
    const clinica = await tx.clinica.create({
      data: {
        name: name.trim(),
        rut: cleanedRut,
        tipo: tipo ?? 'dental',
        pais: pais ?? 'Chile',
        logoUrl: logo?.secure_url,
        logoPublicId: logo?.public_id,
      },
    });

    await tx.user.create({
      data: {
        name: adminName.trim(),
        email: normalizedEmail,
        passwordHash,
        role: 'admin',
        clinicaId: clinica.id,
      },
    });

    return clinica.id;
  });

  const created = (await withStats()).find((c) => c.id === clinicaId);
  return res.status(201).json({ clinica: created });
}

export async function listAllPatients(req: Request, res: Response) {
  const patients = await prisma.patient.findMany({
    orderBy: [{ clinica: { name: 'asc' } }, { lastName: 'asc' }, { firstName: 'asc' }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      rut: true,
      createdAt: true,
      clinicaId: true,
      clinica: { select: { name: true } },
    },
  });

  const summaries = await fetchPrivacyConsentSummaries(patients.map((p) => p.id));
  return res.json({
    patients: patients.map(({ clinica, ...p }) => ({
      ...p,
      clinicaName: clinica.name,
      ...(summaries.get(p.id) ?? {
        privacyConsentStatus: 'pendiente' as const,
        privacyConsentSentAt: null,
        privacyConsentAt: null,
      }),
    })),
  });
}

function snippet(html: string, maxLength = 100): string {
  const plain = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return plain.length > maxLength ? `${plain.slice(0, maxLength)}…` : plain;
}

const DETAIL_LIST_TAKE = 200;

export async function listAllAppointments(req: Request, res: Response) {
  const appointments = await prisma.appointment.findMany({
    orderBy: { startAt: 'desc' },
    take: DETAIL_LIST_TAKE,
    select: {
      id: true,
      startAt: true,
      endAt: true,
      status: true,
      type: true,
      clinicaId: true,
      clinica: { select: { name: true } },
      patient: { select: { firstName: true, lastName: true } },
    },
  });

  return res.json({
    appointments: appointments.map(({ clinica, patient, ...a }) => ({
      ...a,
      clinicaName: clinica.name,
      patientName: `${patient.firstName} ${patient.lastName}`,
    })),
  });
}

export async function listAllTreatmentPlans(req: Request, res: Response) {
  const plans = await prisma.treatmentPlan.findMany({
    orderBy: { createdAt: 'desc' },
    take: DETAIL_LIST_TAKE,
    select: {
      id: true,
      name: true,
      status: true,
      amount: true,
      createdAt: true,
      clinicaId: true,
      clinica: { select: { name: true } },
      patient: { select: { firstName: true, lastName: true } },
    },
  });

  return res.json({
    treatmentPlans: plans.map(({ clinica, patient, ...p }) => ({
      ...p,
      clinicaName: clinica.name,
      patientName: `${patient.firstName} ${patient.lastName}`,
    })),
  });
}

export async function listAllDocuments(req: Request, res: Response) {
  const documents = await prisma.clinicalDocument.findMany({
    orderBy: { createdAt: 'desc' },
    take: DETAIL_LIST_TAKE,
    select: {
      id: true,
      category: true,
      fileName: true,
      createdAt: true,
      clinicaId: true,
      clinica: { select: { name: true } },
      patient: { select: { firstName: true, lastName: true } },
    },
  });

  return res.json({
    documents: documents.map(({ clinica, patient, ...d }) => ({
      ...d,
      clinicaName: clinica.name,
      patientName: `${patient.firstName} ${patient.lastName}`,
    })),
  });
}

export async function listAllLedgerMovements(req: Request, res: Response) {
  const movements = await prisma.ledgerMovement.findMany({
    orderBy: { createdAt: 'desc' },
    take: DETAIL_LIST_TAKE,
    select: {
      id: true,
      type: true,
      debe: true,
      haber: true,
      description: true,
      createdAt: true,
      clinicaId: true,
      clinica: { select: { name: true } },
      patient: { select: { firstName: true, lastName: true } },
    },
  });

  return res.json({
    movements: movements.map(({ clinica, patient, ...m }) => ({
      ...m,
      clinicaName: clinica.name,
      patientName: `${patient.firstName} ${patient.lastName}`,
    })),
  });
}

export async function listAllEvolutions(req: Request, res: Response) {
  const evolutions = await prisma.evolution.findMany({
    orderBy: { createdAt: 'desc' },
    take: DETAIL_LIST_TAKE,
    select: {
      id: true,
      content: true,
      createdAt: true,
      clinicaId: true,
      clinica: { select: { name: true } },
      patient: { select: { firstName: true, lastName: true } },
      professional: { select: { name: true } },
    },
  });

  return res.json({
    evolutions: evolutions.map(({ clinica, patient, professional, content, ...e }) => ({
      ...e,
      summary: snippet(content),
      clinicaName: clinica.name,
      patientName: `${patient.firstName} ${patient.lastName}`,
      professionalName: professional.name,
    })),
  });
}

export async function listAllObservations(req: Request, res: Response) {
  const observations = await prisma.administrativeObservation.findMany({
    orderBy: { createdAt: 'desc' },
    take: DETAIL_LIST_TAKE,
    select: {
      id: true,
      content: true,
      createdAt: true,
      clinicaId: true,
      clinica: { select: { name: true } },
      patient: { select: { firstName: true, lastName: true } },
      professional: { select: { name: true } },
    },
  });

  return res.json({
    observations: observations.map(({ clinica, patient, professional, content, ...o }) => ({
      ...o,
      summary: snippet(content),
      clinicaName: clinica.name,
      patientName: `${patient.firstName} ${patient.lastName}`,
      professionalName: professional.name,
    })),
  });
}

export async function update(req: Request<{ id: string }>, res: Response) {
  const { name, rut, active, tipo, pais, rxEnabled, modules } = req.body as {
    name?: string;
    rut?: string;
    active?: boolean;
    tipo?: string;
    pais?: string;
    rxEnabled?: boolean;
    modules?: Partial<Record<ClinicaModuleKey, boolean>>;
  };

  if (tipo !== undefined && !VALID_TIPOS.includes(tipo)) {
    return res.status(400).json({ error: 'Tipo de clínica inválido' });
  }
  if (pais !== undefined && !VALID_PAISES.includes(pais)) {
    return res.status(400).json({ error: 'País inválido' });
  }
  if (rut !== undefined && rut.trim() && !isValidRut(rut)) {
    return res.status(400).json({ error: 'El RUT ingresado no es válido' });
  }

  const clinica = await prisma.clinica.findUnique({ where: { id: req.params.id } });
  if (!clinica) {
    return res.status(404).json({ error: 'Clínica no encontrada' });
  }

  let cleanedRut: string | null | undefined;
  if (rut !== undefined) {
    cleanedRut = rut.trim() ? cleanRut(rut) : null;
    if (cleanedRut) {
      const existingRut = await prisma.clinica.findFirst({
        where: { rut: cleanedRut, id: { not: req.params.id } },
      });
      if (existingRut) {
        return res.status(409).json({ error: `Ya existe una clínica con el RUT ${cleanedRut}` });
      }
    }
  }

  const mergedModules = modules ? { ...parseClinicaModules(clinica.modules), ...modules } : undefined;

  await prisma.clinica.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(cleanedRut !== undefined ? { rut: cleanedRut } : {}),
      ...(active !== undefined ? { active } : {}),
      ...(tipo !== undefined ? { tipo } : {}),
      ...(pais !== undefined ? { pais } : {}),
      ...(rxEnabled !== undefined ? { rxEnabled } : {}),
      ...(mergedModules !== undefined ? { modules: mergedModules } : {}),
    },
  });

  const updated = (await withStats()).find((c) => c.id === req.params.id);
  return res.json({ clinica: updated });
}

export async function updateLogo(req: Request<{ id: string }>, res: Response) {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'Se requiere un archivo de logo' });
  }

  const clinica = await prisma.clinica.findUnique({ where: { id: req.params.id } });
  if (!clinica) {
    return res.status(404).json({ error: 'Clínica no encontrada' });
  }

  const logo = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: 'image', folder: 'dentalcloud/clinicas/logos' },
      (error, result) => {
        if (error || !result) return reject(error);
        resolve({ secure_url: result.secure_url, public_id: result.public_id });
      }
    );
    stream.end(file.buffer);
  });

  if (clinica.logoPublicId) {
    await cloudinary.uploader.destroy(clinica.logoPublicId).catch(() => {
      // Best-effort: si el logo anterior ya no existe en Cloudinary o falla el
      // borrado, no bloquea la actualización del nuevo logo.
    });
  }

  await prisma.clinica.update({
    where: { id: req.params.id },
    data: { logoUrl: logo.secure_url, logoPublicId: logo.public_id },
  });

  const updated = (await withStats()).find((c) => c.id === req.params.id);
  return res.json({ clinica: updated });
}
