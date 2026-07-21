import type { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { parseClinicaModules, type ClinicaModuleKey } from '../lib/clinicaModules';

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
    prisma.patient.groupBy({ by: ['clinicaId', 'privacyConsentStatus'], _count: { _all: true } }),
  ]);

  const amountByClinicaId = new Map(amountsByClinica.map((a) => [a.clinicaId, a._sum.amount ?? 0]));
  const ledgerByClinicaId = new Map(
    ledgerByClinica.map((l) => [l.clinicaId, { debe: l._sum.debe ?? 0, haber: l._sum.haber ?? 0 }])
  );
  const consentStatsByClinicaId = new Map<string, { pendiente: number; firmado: number; rechazado: number }>();
  for (const row of consentsByClinica) {
    const current = consentStatsByClinicaId.get(row.clinicaId) ?? { pendiente: 0, firmado: 0, rechazado: 0 };
    if (row.privacyConsentStatus === 'firmado') current.firmado += row._count._all;
    else if (row.privacyConsentStatus === 'rechazado') current.rechazado += row._count._all;
    else current.pendiente += row._count._all;
    consentStatsByClinicaId.set(row.clinicaId, current);
  }

  return clinicas.map((c) => ({
    id: c.id,
    name: c.name,
    active: c.active,
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
    consentStats: consentStatsByClinicaId.get(c.id) ?? { pendiente: 0, firmado: 0, rechazado: 0 },
  }));
}

export async function list(req: Request, res: Response) {
  return res.json({ clinicas: await withStats() });
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
      privacyConsentStatus: true,
      privacyConsentSentAt: true,
      privacyConsentAt: true,
      clinicaId: true,
      clinica: { select: { name: true } },
    },
  });

  return res.json({
    patients: patients.map(({ clinica, ...p }) => ({ ...p, clinicaName: clinica.name })),
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
  const { name, active, rxEnabled, modules } = req.body as {
    name?: string;
    active?: boolean;
    rxEnabled?: boolean;
    modules?: Partial<Record<ClinicaModuleKey, boolean>>;
  };

  const clinica = await prisma.clinica.findUnique({ where: { id: req.params.id } });
  if (!clinica) {
    return res.status(404).json({ error: 'Clínica no encontrada' });
  }

  const mergedModules = modules ? { ...parseClinicaModules(clinica.modules), ...modules } : undefined;

  await prisma.clinica.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(active !== undefined ? { active } : {}),
      ...(rxEnabled !== undefined ? { rxEnabled } : {}),
      ...(mergedModules !== undefined ? { modules: mergedModules } : {}),
    },
  });

  const updated = (await withStats()).find((c) => c.id === req.params.id);
  return res.json({ clinica: updated });
}
