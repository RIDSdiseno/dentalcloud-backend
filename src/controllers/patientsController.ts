import type { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { cleanRut, isValidRut } from '../utils/rut';

type PatientInput = {
  rut?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  birthDate?: string;
  address?: string;
};

function toPatientData(body: PatientInput) {
  return {
    firstName: body.firstName!.trim(),
    lastName: body.lastName!.trim(),
    phone: body.phone?.trim() || null,
    email: body.email?.trim() || null,
    birthDate: body.birthDate ? new Date(body.birthDate) : null,
    address: body.address?.trim() || null,
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
  return res.json({ patients });
}

export async function getOne(req: Request<{ id: string }>, res: Response) {
  const patient = await prisma.patient.findUnique({ where: { id: req.params.id } });
  if (!patient) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }
  return res.json({ patient });
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
  return res.json({ patient: updated });
}
