import bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import type { Request, Response } from 'express';
import prisma from '../lib/prisma';
import cloudinary from '../lib/cloudinary';
import { parseClinicaModules, type ClinicaModuleKey } from '../lib/clinicaModules';
import { ALLERGY_KEYS } from '../lib/allergies';
import { fetchPrivacyConsentSummaries } from '../lib/privacyConsentSummary';
import { cleanRut, isValidRut } from '../utils/rut';
import {
  fetchRemoteAppointments,
  fetchRemoteClinics,
  fetchRemotePatients,
  isFederationConfigured,
  mirrorClinicToDentalDemo,
} from '../lib/federationClient';
import { syncClinicaActiveStateToFederation, syncClinicaToFederation, type FederationSyncKey } from '../lib/federationSync';
import { computeTreatmentStatus } from '../utils/treatmentStatus';

const FEDERATION_SYNC_KEYS: FederationSyncKey[] = [
  'patients',
  'appointments',
  'treatmentPlans',
  'users',
  'sucursales',
  'catalog',
];

function parseFederationSyncSettings(raw: unknown): Record<FederationSyncKey, boolean> {
  const parsed = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const result = {} as Record<FederationSyncKey, boolean>;
  for (const key of FEDERATION_SYNC_KEYS) {
    result[key] = parsed[key] !== false;
  }
  return result;
}

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
    federatedClinicId: c.federatedClinicId,
    federationCatalogOnly: c.federationCatalogOnly,
    federationPaused: c.federationPaused,
    federationSyncSettings: parseFederationSyncSettings(c.federationSyncSettings),
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

  const clinica = await prisma.$transaction(async (tx) => {
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

    return clinica;
  });

  // Best-effort: crea el espejo de esta clínica en Dental-Demo-Back para que
  // ambas plataformas compartan sus pacientes y agenda desde ahora. No
  // bloquea ni falla la creación si la otra plataforma no responde.
  syncClinicaToFederation(clinica, { name: adminName.trim(), email: normalizedEmail, password: adminPassword }).catch((err) => {
    console.error('No se pudo sincronizar la clínica recién creada con Dental-Demo-Back', err);
  });

  const created = (await withStats()).find((c) => c.id === clinica.id);
  return res.status(201).json({ clinica: created });
}

async function getLocalPatients() {
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
  return patients.map(({ clinica, ...p }) => ({
    ...p,
    clinicaName: clinica.name,
    ...(summaries.get(p.id) ?? {
      privacyConsentStatus: 'pendiente' as const,
      privacyConsentSentAt: null,
      privacyConsentAt: null,
    }),
  }));
}

export async function listAllPatients(req: Request, res: Response) {
  return res.json({ patients: await getLocalPatients() });
}

function snippet(html: string, maxLength = 100): string {
  const plain = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return plain.length > maxLength ? `${plain.slice(0, maxLength)}…` : plain;
}

const DETAIL_LIST_TAKE = 200;

async function getLocalAppointments() {
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

  return appointments.map(({ clinica, patient, ...a }) => ({
    ...a,
    clinicaName: clinica.name,
    patientName: `${patient.firstName} ${patient.lastName}`,
  }));
}

export async function listAllAppointments(req: Request, res: Response) {
  return res.json({ appointments: await getLocalAppointments() });
}

// Vista combinada para el super-admin: clínicas/pacientes/citas propias de
// DentalCloud + las de Dental-Demo-Back, obtenidas en vivo (sin copia local).
// Si Dental-Demo-Back no responde o no está configurado, se devuelve sólo lo
// local en vez de tumbar el endpoint — mismo criterio que dimageClient.
export async function getFederatedOverview(req: Request, res: Response) {
  const local = {
    clinicas: await withStats(),
    patients: await getLocalPatients(),
    appointments: await getLocalAppointments(),
  };

  if (!isFederationConfigured()) {
    return res.json({ local, remote: null, remoteAvailable: false });
  }

  try {
    const [clinics, patients, appointments] = await Promise.all([
      fetchRemoteClinics(),
      fetchRemotePatients(),
      fetchRemoteAppointments(),
    ]);
    return res.json({ local, remote: { clinics, patients, appointments }, remoteAvailable: true });
  } catch {
    return res.json({ local, remote: null, remoteAvailable: false });
  }
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
  const { name, rut, active, tipo, pais, rxEnabled, modules, federationCatalogOnly, federationPaused, federationSyncSettings } =
    req.body as {
      name?: string;
      rut?: string;
      active?: boolean;
      tipo?: string;
      pais?: string;
      rxEnabled?: boolean;
      modules?: Partial<Record<ClinicaModuleKey, boolean>>;
      federationCatalogOnly?: boolean;
      federationPaused?: boolean;
      federationSyncSettings?: Partial<Record<FederationSyncKey, boolean>>;
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

  if (
    (federationCatalogOnly !== undefined || federationPaused !== undefined || federationSyncSettings !== undefined) &&
    !clinica.federatedClinicId
  ) {
    return res.status(400).json({ error: 'Esta clínica no está conectada por federación' });
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
  const mergedFederationSyncSettings = federationSyncSettings
    ? { ...parseFederationSyncSettings(clinica.federationSyncSettings), ...federationSyncSettings }
    : undefined;

  const updatedClinica = await prisma.clinica.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(cleanedRut !== undefined ? { rut: cleanedRut } : {}),
      ...(active !== undefined ? { active } : {}),
      ...(tipo !== undefined ? { tipo } : {}),
      ...(pais !== undefined ? { pais } : {}),
      ...(rxEnabled !== undefined ? { rxEnabled } : {}),
      ...(mergedModules !== undefined ? { modules: mergedModules } : {}),
      ...(federationCatalogOnly !== undefined ? { federationCatalogOnly } : {}),
      ...(federationPaused !== undefined ? { federationPaused } : {}),
      ...(mergedFederationSyncSettings !== undefined ? { federationSyncSettings: mergedFederationSyncSettings } : {}),
    },
  });

  if (active !== undefined) {
    // Best-effort: si la clínica está emparejada, activar/desactivarla acá
    // (equivalente a "eliminarla" de forma reversible) también suspende o
    // reactiva su espejo en Dental-Demo-Back.
    syncClinicaActiveStateToFederation(updatedClinica).catch((err) => {
      console.error('No se pudo sincronizar el estado activo de la clínica con Dental-Demo-Back', err);
    });
  }

  const updated = (await withStats()).find((c) => c.id === req.params.id);
  return res.json({ clinica: updated });
}

// Empareja manualmente una clínica ya existente con su par en Dental-Demo,
// sin crear ninguna cuenta de usuario (a diferencia de syncClinicaToFederation,
// que se usa al crear una clínica nueva y sí manda datos de admin) — solo el
// registro puro de la clínica. Arranca en modo "solo catálogo" por seguridad:
// si la clínica ya operaba con datos reales propios, no se mezclan de golpe.
export async function connectFederation(req: Request<{ id: string }>, res: Response) {
  if (!isFederationConfigured()) {
    return res.status(400).json({ error: 'La federación no está configurada en este servidor' });
  }

  const clinica = await prisma.clinica.findUnique({ where: { id: req.params.id } });
  if (!clinica) {
    return res.status(404).json({ error: 'Clínica no encontrada' });
  }
  if (clinica.federatedClinicId) {
    return res.status(409).json({ error: 'Esta clínica ya está conectada' });
  }

  try {
    const mirror = await mirrorClinicToDentalDemo({ externalId: clinica.id, name: clinica.name, pais: clinica.pais });
    await prisma.clinica.update({
      where: { id: clinica.id },
      data: { federatedClinicId: mirror.id, federationCatalogOnly: true, federationPaused: false },
    });
  } catch {
    return res.status(502).json({ error: 'No se pudo conectar con Dental-Demo. Intenta nuevamente.' });
  }

  const updated = (await withStats()).find((c) => c.id === req.params.id);
  return res.json({ clinica: updated });
}

// Desconecta la clínica de su par en Dental-Demo. Solo afecta este lado —
// no borra ni desactiva nada allá. Al reconectar (connectFederation), Dental-Demo
// busca por el mismo externalId (el id de esta clínica, que no cambia) y
// re-vincula el registro que ya existía en vez de crear uno duplicado — solo
// se pierden las banderas locales (federationCatalogOnly/federationPaused),
// que vuelven a su valor por defecto.
export async function disconnectFederation(req: Request<{ id: string }>, res: Response) {
  const clinica = await prisma.clinica.findUnique({ where: { id: req.params.id } });
  if (!clinica) {
    return res.status(404).json({ error: 'Clínica no encontrada' });
  }
  if (!clinica.federatedClinicId) {
    return res.status(409).json({ error: 'Esta clínica no está conectada' });
  }

  await prisma.clinica.update({
    where: { id: clinica.id },
    data: { federatedClinicId: null, federationCatalogOnly: false, federationPaused: false, federationSyncSettings: {} },
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

// --- Endpoints "mirror": reciben escrituras de federación desde
// Dental-Demo-Back (X-API-KEY, ver requireFederationOrSuperAdmin). Todos son
// upsert por id externo, así que son seguros de reintentar sin duplicar.

// Dental-Demo maneja "DENTAL"/"ESTHETIC"/"BOTH" (su selector de tipo de
// clínica); nosotros usamos 'dental'/'estetica'/'ambas'. Si no llega el
// campo (llamadas antiguas, o clínicas creadas antes de que Dental-Demo
// tuviera este selector), se asume 'dental' — no 'estetica' como antes,
// porque ya no es cierto que toda clínica federada sea de estética.
const REMOTE_CLINIC_TYPE_MAP: Record<string, 'dental' | 'estetica' | 'ambas'> = {
  DENTAL: 'dental',
  ESTHETIC: 'estetica',
  BOTH: 'ambas',
};

export async function mirrorClinica(req: Request, res: Response) {
  const { externalId, name, pais, adminName, adminEmail, adminPassword, active, clinicType } = req.body as {
    externalId?: string;
    name?: string;
    pais?: string;
    adminName?: string | null;
    adminEmail?: string | null;
    adminPassword?: string | null;
    active?: boolean;
    clinicType?: string;
  };
  if (!externalId || !name?.trim()) {
    return res.status(400).json({ error: 'externalId y name son requeridos' });
  }
  const tipo = (clinicType && REMOTE_CLINIC_TYPE_MAP[clinicType]) || 'dental';

  const existing = await prisma.clinica.findUnique({
    where: { federatedClinicId: externalId },
    include: { chairs: true },
  });

  if (existing) {
    const updated = await prisma.clinica.update({
      where: { id: existing.id },
      data: { name: name.trim(), ...(pais ? { pais } : {}), ...(active !== undefined ? { active } : {}) },
    });
    return res.json({ id: updated.id, chairId: existing.chairs[0]?.id ?? null });
  }

  const created = await prisma.$transaction(async (tx) => {
    const clinica = await tx.clinica.create({
      data: {
        name: name.trim(),
        pais: pais || 'Chile',
        federatedClinicId: externalId,
        tipo,
        ...(active !== undefined ? { active } : {}),
      },
    });
    const chair = await tx.chair.create({
      data: { clinicaId: clinica.id, number: 1, name: 'Sillón externo' },
    });
    // Sin esto, un holding creado por federación nace sin ninguna Sucursal
    // ("Clínica" en la UI) — y como los presupuestos exigen elegir una en el
    // formulario, ningún profesional puede crear presupuestos ahí hasta que
    // alguien la cree a mano. Se crea junto con la Clinica, igual que el Chair.
    const sucursal = await tx.sucursal.create({
      data: { clinicaId: clinica.id, name: 'Clínica federada' },
    });
    return { clinica, chair, sucursal };
  });

  // Espeja también al administrador, con la misma contraseña que se ingresó
  // al crear la clínica del otro lado, para que pueda loguearse en ambas
  // plataformas sin pasos manuales. Si esta llamada llegó por un reintento
  // (falló la primera vez) ya no hay contraseña en texto plano disponible —
  // se genera una temporal en su lugar.
  const normalizedAdminEmail = adminEmail?.trim().toLowerCase();
  if (normalizedAdminEmail) {
    const existingUser = await prisma.user.findUnique({ where: { email: normalizedAdminEmail } });
    if (!existingUser) {
      const passwordToUse = adminPassword?.trim() || randomBytes(12).toString('hex');
      const passwordHash = await bcrypt.hash(passwordToUse, 10);
      await prisma.user.create({
        data: {
          name: adminName?.trim() || name.trim(),
          email: normalizedAdminEmail,
          passwordHash,
          role: 'admin',
          clinicaId: created.clinica.id,
        },
      });
    }
  }

  return res.status(201).json({ id: created.clinica.id, chairId: created.chair.id });
}

export async function mirrorPatient(req: Request, res: Response) {
  const { clinicaId, externalId, firstName, lastName, rut, email, phone, birthDate, heightCm, weightKg, allergies, allergyNotes, medicalConditions, currentMedications } = req.body as {
    clinicaId?: string;
    externalId?: string;
    firstName?: string;
    lastName?: string;
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

  if (!clinicaId || !externalId || !firstName?.trim() || !lastName?.trim()) {
    return res.status(400).json({ error: 'clinicaId, externalId, firstName y lastName son requeridos' });
  }
  if (!rut?.trim()) {
    // DentalCloud exige RUT (identidad del paciente, único por clínica) — un
    // paciente creado sin RUT en Dental-Demo-Back no se puede espejar todavía.
    return res.status(422).json({ error: 'DentalCloud requiere RUT para crear un paciente' });
  }

  const validAllergyKeys: readonly string[] = ALLERGY_KEYS;
  const data = {
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    rut: rut.trim(),
    email: email?.trim() || null,
    phone: phone?.trim() || null,
    birthDate: birthDate ? new Date(birthDate) : null,
    heightCm: heightCm ?? null,
    weightKg: weightKg ?? null,
    allergies: Array.isArray(allergies) ? allergies.filter((a) => validAllergyKeys.includes(a)) : [],
    allergyNotes: allergyNotes?.trim() || null,
    medicalConditions: medicalConditions?.trim() || null,
    currentMedications: currentMedications?.trim() || null,
  };

  const existing = await prisma.patient.findUnique({ where: { federatedPatientId: externalId } });
  if (existing) {
    const updated = await prisma.patient.update({ where: { id: existing.id }, data });
    return res.json({ id: updated.id });
  }

  // El rut es único por clínica: si ya había un paciente local con ese rut
  // (creado antes de que la clínica se emparejara), lo vinculamos en vez de
  // duplicar.
  const byRut = await prisma.patient.findFirst({ where: { clinicaId, rut: data.rut } });
  if (byRut) {
    const linked = await prisma.patient.update({
      where: { id: byRut.id },
      data: { ...data, federatedPatientId: externalId },
    });
    return res.json({ id: linked.id });
  }

  const created = await prisma.patient.create({ data: { ...data, clinicaId, federatedPatientId: externalId } });
  return res.status(201).json({ id: created.id });
}

export async function mirrorAppointment(req: Request, res: Response) {
  const { clinicaId, patientId, externalId, startAt, endAt, status, notes } = req.body as {
    clinicaId?: string;
    patientId?: string;
    externalId?: string;
    startAt?: string;
    endAt?: string;
    status?: string;
    notes?: string | null;
  };

  if (!clinicaId || !patientId || !externalId || !startAt || !endAt) {
    return res.status(400).json({ error: 'clinicaId, patientId, externalId, startAt y endAt son requeridos' });
  }

  const clinica = await prisma.clinica.findUnique({ where: { id: clinicaId }, include: { chairs: true } });
  const chairId = clinica?.chairs.find((c) => c.name === 'Sillón externo')?.id ?? clinica?.chairs[0]?.id;
  if (!chairId) {
    return res.status(422).json({ error: 'La clínica espejo no tiene un sillón disponible para agendar' });
  }

  const localStatus = status === 'CANCELLED' || status === 'NO_SHOW' ? 'cancelada' : 'agendada';
  const data = {
    startAt: new Date(startAt),
    endAt: new Date(endAt),
    status: localStatus,
    notes: notes?.trim() || null,
  };

  const existing = await prisma.appointment.findUnique({ where: { federatedAppointmentId: externalId } });
  if (existing) {
    const updated = await prisma.appointment.update({ where: { id: existing.id }, data });
    return res.json({ id: updated.id });
  }

  const created = await prisma.appointment.create({
    data: {
      ...data,
      chairId,
      patientId,
      clinicaId,
      federatedAppointmentId: externalId,
    },
  });
  return res.status(201).json({ id: created.id });
}

async function recalcTreatmentPlanTotals(treatmentPlanId: string) {
  const plan = await prisma.treatmentPlan.findUniqueOrThrow({
    where: { id: treatmentPlanId },
    include: { items: true },
  });
  const amount = plan.items.reduce((sum, i) => sum + i.cost, 0);
  const status = computeTreatmentStatus(plan.items, plan.status);
  await prisma.treatmentPlan.update({ where: { id: treatmentPlanId }, data: { amount, status } });
}

export async function mirrorTreatmentPlan(req: Request, res: Response) {
  const { patientId, externalId, title, description, planType, facialGender, status, convenioId, previsionId, professionalName } = req.body as {
    patientId?: string;
    externalId?: string;
    title?: string;
    description?: string | null;
    planType?: 'DENTAL' | 'ESTHETIC';
    facialGender?: string | null;
    status?: string;
    convenioId?: string;
    previsionId?: string;
    professionalName?: string;
  };

  if (!patientId || !externalId || !title?.trim()) {
    return res.status(400).json({ error: 'patientId, externalId y title son requeridos' });
  }

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { clinicaId: true, clinica: { select: { tipo: true } } },
  });
  if (!patient) {
    return res.status(400).json({ error: 'El paciente indicado no existe' });
  }

  // convenioId/previsionId ya vienen resueltos al id local de este lado (el
  // emisor los tradujo vía su propio federatedConvenioId/federatedPrevisionId)
  // — se valida que existan y sean de la misma clínica antes de enlazarlos.
  const [convenio, prevision] = await Promise.all([
    convenioId ? prisma.convenio.findFirst({ where: { id: convenioId, clinicaId: patient.clinicaId } }) : null,
    previsionId ? prisma.prevision.findFirst({ where: { id: previsionId, clinicaId: patient.clinicaId } }) : null,
  ]);

  const data = {
    name: title.trim(),
    notes: description?.trim() || null,
    // Sólo "alta" se fuerza — el resto de los estados los deriva
    // computeTreatmentStatus a partir de los ítems del plan.
    ...(status === 'alta' ? { status: 'alta' } : {}),
    ...(convenioId !== undefined ? { convenioId: convenio?.id ?? null } : {}),
    ...(previsionId !== undefined ? { previsionId: prevision?.id ?? null } : {}),
    // No hay federación de cuentas de staff — sólo se guarda el nombre como
    // dato informativo (no un professionalId real).
    ...(professionalName !== undefined ? { remoteProfessionalName: professionalName?.trim() || null } : {}),
    // 'hombre'|'mujer' — determina qué foto usa el mapa facial. Solo tiene
    // sentido para planes estéticos, pero se guarda igual si viaja (no hay
    // razón para descartarlo si el plan es "ambas" y cambia de tipo después).
    ...(facialGender !== undefined ? { facialGender: facialGender?.trim() || null } : {}),
  };

  const existing = await prisma.treatmentPlan.findUnique({ where: { federatedTreatmentPlanId: externalId } });
  if (existing) {
    const updated = await prisma.treatmentPlan.update({ where: { id: existing.id }, data });
    return res.json({ id: updated.id });
  }

  // Igual criterio que en la creación humana (treatmentPlansController.ts):
  // el tipo de diagrama sigue el tipo de la clínica salvo que sea "ambas",
  // donde recién ahí importa lo que traiga el plan de origen.
  const diagramType =
    patient.clinica.tipo === 'ambas' ? (planType === 'ESTHETIC' ? 'estetica' : 'dental') : patient.clinica.tipo === 'estetica' ? 'estetica' : 'dental';

  const created = await prisma.treatmentPlan.create({
    data: {
      ...data,
      patientId,
      clinicaId: patient.clinicaId,
      diagramType,
      federatedTreatmentPlanId: externalId,
    },
  });
  return res.status(201).json({ id: created.id });
}

export async function mirrorTreatmentItem(req: Request, res: Response) {
  const {
    treatmentPlanId,
    externalId,
    name,
    description,
    tooth,
    unitPrice,
    removed,
    prestacionId,
    listPrice,
    convenioDiscountPercent,
    productName,
    productLot,
    productExpiresAt,
    productQuantity,
  } = req.body as {
    treatmentPlanId?: string;
    externalId?: string;
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

  if (!treatmentPlanId || !externalId) {
    return res.status(400).json({ error: 'treatmentPlanId y externalId son requeridos' });
  }

  const existing = await prisma.treatmentItem.findUnique({ where: { federatedTreatmentItemId: externalId } });

  if (removed) {
    if (existing) {
      await prisma.treatmentItem.delete({ where: { id: existing.id } });
      await recalcTreatmentPlanTotals(treatmentPlanId);
    }
    return res.json({ id: existing?.id ?? null });
  }

  if (!name?.trim()) {
    return res.status(400).json({ error: 'name es requerido' });
  }

  // prestacionId ya viene resuelto al id local de este lado (el emisor lo
  // tradujo vía su propio federatedPrestacionId).
  const prestacion = prestacionId ? await prisma.prestacion.findUnique({ where: { id: prestacionId } }) : null;

  const data = {
    description: name.trim(),
    cost: Math.round(unitPrice ?? 0),
    listPrice: Math.round(listPrice ?? unitPrice ?? 0),
    toothNumber: tooth?.trim() || null,
    notes: description?.trim() || null,
    completed: Boolean(req.body?.completed),
    prestacionId: prestacion?.id ?? null,
    convenioDiscountPercent: Math.round(convenioDiscountPercent ?? 0),
    productName: productName?.trim() || null,
    productLot: productLot?.trim() || null,
    productExpiresAt: productExpiresAt ? new Date(productExpiresAt) : null,
    productQuantity: productQuantity?.trim() || null,
  };

  let itemId: string;
  if (existing) {
    const updated = await prisma.treatmentItem.update({ where: { id: existing.id }, data });
    itemId = updated.id;
  } else {
    const plan = await prisma.treatmentPlan.findUnique({ where: { id: treatmentPlanId }, select: { clinicaId: true } });
    if (!plan) {
      return res.status(400).json({ error: 'El presupuesto indicado no existe' });
    }
    const created = await prisma.treatmentItem.create({
      data: { ...data, treatmentPlanId, clinicaId: plan.clinicaId, federatedTreatmentItemId: externalId },
    });
    itemId = created.id;
  }

  await recalcTreatmentPlanTotals(treatmentPlanId);
  return res.status(existing ? 200 : 201).json({ id: itemId });
}

export async function mirrorConvenio(req: Request, res: Response) {
  const { clinicaId, externalId, name, discountPercent, active } = req.body as {
    clinicaId?: string;
    externalId?: string;
    name?: string;
    discountPercent?: number;
    active?: boolean;
  };

  if (!clinicaId || !externalId || !name?.trim()) {
    return res.status(400).json({ error: 'clinicaId, externalId y name son requeridos' });
  }

  const data = {
    name: name.trim(),
    discountPercent: Math.min(100, Math.max(0, Math.round(discountPercent ?? 0))),
    active: active ?? true,
  };

  const existing = await prisma.convenio.findUnique({ where: { federatedConvenioId: externalId } });
  if (existing) {
    const updated = await prisma.convenio.update({ where: { id: existing.id }, data });
    return res.json({ id: updated.id });
  }

  // El nombre es único por clínica: si ya había un convenio local con ese
  // nombre (creado antes de que la clínica se emparejara, o desde el otro
  // lado sin id todavía guardado), lo vinculamos en vez de duplicar.
  const byName = await prisma.convenio.findFirst({ where: { clinicaId, name: data.name } });
  if (byName) {
    const linked = await prisma.convenio.update({ where: { id: byName.id }, data: { ...data, federatedConvenioId: externalId } });
    return res.json({ id: linked.id });
  }

  const created = await prisma.convenio.create({ data: { ...data, clinicaId, federatedConvenioId: externalId } });
  return res.status(201).json({ id: created.id });
}

export async function mirrorPrestacion(req: Request, res: Response) {
  const { clinicaId, externalId, name, code, basePrice, active, odontogramMode } = req.body as {
    clinicaId?: string;
    externalId?: string;
    name?: string;
    code?: string | null;
    basePrice?: number;
    active?: boolean;
    odontogramMode?: string;
  };

  if (!clinicaId || !externalId || !name?.trim()) {
    return res.status(400).json({ error: 'clinicaId, externalId y name son requeridos' });
  }

  const data = {
    name: name.trim(),
    code: code?.trim() || null,
    basePrice: Math.max(0, Math.round(basePrice ?? 0)),
    active: active ?? true,
    // Dental-Demo-Back no distingue categoría (todas sus prestaciones son
    // dentales) — siempre manda un modo válido para esta columna.
    ...(odontogramMode ? { odontogramMode } : {}),
  };

  const existing = await prisma.prestacion.findUnique({ where: { federatedPrestacionId: externalId } });
  if (existing) {
    const updated = await prisma.prestacion.update({ where: { id: existing.id }, data });
    return res.json({ id: updated.id });
  }

  // El código es único por clínica: si ya había una prestación local con ese
  // código, la vinculamos en vez de duplicar (sólo aplica si viene código).
  const byCode = data.code
    ? await prisma.prestacion.findFirst({ where: { clinicaId, code: data.code } })
    : null;
  if (byCode) {
    const linked = await prisma.prestacion.update({ where: { id: byCode.id }, data: { ...data, federatedPrestacionId: externalId } });
    return res.json({ id: linked.id });
  }

  const created = await prisma.prestacion.create({ data: { ...data, clinicaId, federatedPrestacionId: externalId } });
  return res.status(201).json({ id: created.id });
}

export async function mirrorPrevision(req: Request, res: Response) {
  const { clinicaId, externalId, name, active } = req.body as {
    clinicaId?: string;
    externalId?: string;
    name?: string;
    active?: boolean;
  };

  if (!clinicaId || !externalId || !name?.trim()) {
    return res.status(400).json({ error: 'clinicaId, externalId y name son requeridos' });
  }

  const data = {
    name: name.trim(),
    active: active ?? true,
  };

  const existing = await prisma.prevision.findUnique({ where: { federatedPrevisionId: externalId } });
  if (existing) {
    const updated = await prisma.prevision.update({ where: { id: existing.id }, data });
    return res.json({ id: updated.id });
  }

  const byName = await prisma.prevision.findFirst({ where: { clinicaId, name: data.name } });
  if (byName) {
    const linked = await prisma.prevision.update({ where: { id: byName.id }, data: { ...data, federatedPrevisionId: externalId } });
    return res.json({ id: linked.id });
  }

  const created = await prisma.prevision.create({ data: { ...data, clinicaId, federatedPrevisionId: externalId } });
  return res.status(201).json({ id: created.id });
}

// Dental-Demo-Back no tiene los mismos roles que DentalCloud (allá son
// CLINIC_OWNER/LOCATION_MANAGER/MARKETING_MANAGER/PROFESSIONAL/RECEPTIONIST/
// ASSISTANT) — se traducen al rol más parecido en vez de exigir que
// coincidan exactamente. LOCATION_MANAGER/MARKETING_MANAGER no tienen
// equivalente real acá, así que caen a "operador" (el rol sin privilegios
// especiales) en vez de heredar accidentalmente permisos de admin.
function mapRemoteRoleToLocal(remoteRole: string | undefined): string {
  switch (remoteRole) {
    case 'CLINIC_OWNER':
      return 'admin';
    case 'PROFESSIONAL':
      return 'odontologo';
    case 'RECEPTIONIST':
    case 'ASSISTANT':
    case 'LOCATION_MANAGER':
    case 'MARKETING_MANAGER':
      return 'operador';
    default:
      return 'operador';
  }
}

export async function mirrorUser(req: Request, res: Response) {
  const { clinicaId, externalId, name, email, password, role, rut } = req.body as {
    clinicaId?: string;
    externalId?: string;
    name?: string;
    email?: string;
    password?: string | null;
    role?: string;
    rut?: string | null;
  };

  if (!clinicaId || !externalId || !name?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'clinicaId, externalId, name y email son requeridos' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const localRole = mapRemoteRoleToLocal(role);
  const cleanedRut = rut?.trim() && isValidRut(rut) ? cleanRut(rut) : null;

  const existing = await prisma.user.findUnique({ where: { federatedUserId: externalId } });
  if (existing) {
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: { name: name.trim(), role: localRole, rut: cleanedRut },
    });
    return res.json({ id: updated.id });
  }

  // El email es único globalmente — si ya hay una cuenta local con ese email
  // en esta misma clínica (creada antes de emparejar, o por otra vía), se
  // vincula en vez de fallar. Si pertenece a OTRA clínica, no se toca (podría
  // ser una persona distinta) y se devuelve error en su lugar.
  const byEmail = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (byEmail) {
    if (byEmail.clinicaId !== clinicaId) {
      return res.status(409).json({ error: `El email ${normalizedEmail} ya está en uso por un usuario de otra clínica` });
    }
    const linked = await prisma.user.update({
      where: { id: byEmail.id },
      data: { name: name.trim(), role: localRole, rut: cleanedRut, federatedUserId: externalId },
    });
    return res.json({ id: linked.id });
  }

  // Si no llega password en texto plano (reintento posterior a un primer
  // intento fallido), se genera uno temporal — el profesional puede pedir
  // "olvidé mi contraseña" o el admin se la puede compartir manualmente.
  const passwordToUse = password?.trim() || randomBytes(12).toString('hex');
  const passwordHash = await bcrypt.hash(passwordToUse, 10);

  const created = await prisma.user.create({
    data: {
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      role: localRole,
      rut: cleanedRut,
      clinicaId,
      federatedUserId: externalId,
    },
  });
  return res.status(201).json({ id: created.id });
}

export async function mirrorSucursal(req: Request, res: Response) {
  const { clinicaId, externalId, name, active } = req.body as {
    clinicaId?: string;
    externalId?: string;
    name?: string;
    active?: boolean;
  };

  if (!clinicaId || !externalId || !name?.trim()) {
    return res.status(400).json({ error: 'clinicaId, externalId y name son requeridos' });
  }

  const data = {
    name: name.trim(),
    active: active ?? true,
  };

  const existing = await prisma.sucursal.findUnique({ where: { federatedSucursalId: externalId } });
  if (existing) {
    const updated = await prisma.sucursal.update({ where: { id: existing.id }, data });
    return res.json({ id: updated.id });
  }

  const byName = await prisma.sucursal.findFirst({ where: { clinicaId, name: data.name } });
  if (byName) {
    const linked = await prisma.sucursal.update({
      where: { id: byName.id },
      data: { ...data, federatedSucursalId: externalId },
    });
    return res.json({ id: linked.id });
  }

  const created = await prisma.sucursal.create({ data: { ...data, clinicaId, federatedSucursalId: externalId } });
  return res.status(201).json({ id: created.id });
}
