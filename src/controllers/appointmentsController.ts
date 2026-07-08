import type { Request, Response } from 'express';
import prisma from '../lib/prisma';

type AppointmentInput = {
  chairId?: string;
  patientId?: string;
  professionalId?: string;
  startAt?: string;
  endAt?: string;
  notes?: string;
  type?: string;
};

const APPOINTMENT_TYPES = ['cita', 'control'];

const include = {
  patient: {
    select: { id: true, rut: true, firstName: true, lastName: true, phone: true },
  },
  professional: {
    select: { id: true, name: true },
  },
  chair: {
    select: { id: true, number: true, name: true },
  },
} as const;

export async function list(req: Request, res: Response) {
  const dateParam = typeof req.query.date === 'string' ? req.query.date : null;
  const fromParam = typeof req.query.from === 'string' ? req.query.from : null;
  const toParam = typeof req.query.to === 'string' ? req.query.to : null;
  const chairId = typeof req.query.chairId === 'string' ? req.query.chairId : undefined;
  const patientId = typeof req.query.patientId === 'string' ? req.query.patientId : undefined;
  const mineOnly = req.query.mine === 'true';

  let rangeStart: Date | undefined;
  let rangeEnd: Date | undefined;

  if (dateParam) {
    rangeStart = new Date(`${dateParam}T00:00:00`);
    rangeEnd = new Date(`${dateParam}T23:59:59.999`);
  } else if (fromParam && toParam) {
    rangeStart = new Date(`${fromParam}T00:00:00`);
    rangeEnd = new Date(`${toParam}T23:59:59.999`);
  } else if (!patientId) {
    return res.status(400).json({ error: 'Se requiere date, from y to, o patientId' });
  }

  if (rangeStart && (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd!.getTime()))) {
    return res.status(400).json({ error: 'Fecha inválida' });
  }

  const restrictToOwn = mineOnly && req.user!.role !== 'admin';

  const appointments = await prisma.appointment.findMany({
    where: {
      ...(rangeStart ? { startAt: { gte: rangeStart, lte: rangeEnd } } : {}),
      ...(patientId ? { patientId } : { status: { not: 'cancelada' } }),
      ...(chairId ? { chairId } : {}),
      ...(restrictToOwn ? { professionalId: req.user!.sub } : {}),
    },
    include,
    orderBy: { startAt: patientId && !rangeStart ? 'desc' : 'asc' },
  });
  return res.json({ appointments });
}

export async function create(req: Request, res: Response) {
  const body = req.body as AppointmentInput;

  if (!body.chairId || !body.patientId || !body.startAt || !body.endAt) {
    return res.status(400).json({ error: 'chairId, patientId, startAt y endAt son requeridos' });
  }

  const startAt = new Date(body.startAt);
  const endAt = new Date(body.endAt);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
    return res.status(400).json({ error: 'El rango de horario ingresado no es válido' });
  }

  if (body.type && !APPOINTMENT_TYPES.includes(body.type)) {
    return res.status(400).json({ error: `El tipo debe ser uno de: ${APPOINTMENT_TYPES.join(', ')}` });
  }

  const [chair, patient] = await Promise.all([
    prisma.chair.findUnique({ where: { id: body.chairId } }),
    prisma.patient.findUnique({ where: { id: body.patientId } }),
  ]);
  if (!chair || !chair.active) {
    return res.status(400).json({ error: 'El sillón seleccionado no existe o no está activo' });
  }
  if (!patient) {
    return res.status(400).json({ error: 'El paciente seleccionado no existe' });
  }

  let professionalId = req.user!.sub;
  if (req.user!.role === 'admin' && body.professionalId) {
    const professional = await prisma.user.findUnique({ where: { id: body.professionalId } });
    if (!professional) {
      return res.status(400).json({ error: 'El profesional seleccionado no existe' });
    }
    professionalId = body.professionalId;
  }

  const overlapping = await prisma.appointment.findFirst({
    where: {
      chairId: body.chairId,
      status: { not: 'cancelada' },
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
  });
  if (overlapping) {
    return res.status(409).json({ error: 'Ese sillón ya tiene una cita en ese horario' });
  }

  const appointment = await prisma.appointment.create({
    data: {
      chairId: body.chairId,
      patientId: body.patientId,
      professionalId,
      startAt,
      endAt,
      notes: body.notes?.trim() || null,
      type: body.type || 'cita',
    },
    include,
  });
  return res.status(201).json({ appointment });
}

export async function remove(req: Request<{ id: string }>, res: Response) {
  const appointment = await prisma.appointment.findUnique({ where: { id: req.params.id } });
  if (!appointment) {
    return res.status(404).json({ error: 'Cita no encontrada' });
  }

  if (req.user!.role !== 'admin' && appointment.professionalId !== req.user!.sub) {
    return res.status(403).json({ error: 'No puedes cancelar una cita de otro profesional' });
  }

  await prisma.appointment.update({
    where: { id: req.params.id },
    data: { status: 'cancelada' },
  });
  return res.status(204).send();
}
