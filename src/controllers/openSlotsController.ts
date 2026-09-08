import type { Request, Response } from 'express';
import prisma from '../lib/prisma';

const include = {
  chair: { select: { id: true, number: true, name: true } },
  professional: { select: { id: true, name: true } },
} as const;

export async function list(req: Request, res: Response) {
  const dateParam = typeof req.query.date === 'string' ? req.query.date : null;
  const professionalId = typeof req.query.professionalId === 'string' ? req.query.professionalId : undefined;

  let rangeStart: Date | undefined;
  let rangeEnd: Date | undefined;
  if (dateParam) {
    rangeStart = new Date(`${dateParam}T00:00:00`);
    rangeEnd = new Date(`${dateParam}T23:59:59.999`);
    if (Number.isNaN(rangeStart.getTime())) {
      return res.status(400).json({ error: 'Fecha inválida' });
    }
  }

  const openSlots = await prisma.openSlot.findMany({
    where: {
      clinicaId: req.user!.clinicaId!,
      status: 'abierta',
      ...(rangeStart ? { startAt: { gte: rangeStart, lte: rangeEnd } } : {}),
      ...(professionalId ? { professionalId } : {}),
    },
    include,
    orderBy: { startAt: 'asc' },
  });
  return res.json({ openSlots });
}

export async function create(req: Request, res: Response) {
  const { chairId, professionalId, startAt, endAt } = req.body as {
    chairId?: string;
    professionalId?: string;
    startAt?: string;
    endAt?: string;
  };
  if (!chairId || !startAt || !endAt) {
    return res.status(400).json({ error: 'chairId, startAt y endAt son requeridos' });
  }

  const start = new Date(startAt);
  const end = new Date(endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return res.status(400).json({ error: 'El rango de horario ingresado no es válido' });
  }

  const clinicaId = req.user!.clinicaId!;
  const isAdmin = req.user!.role === 'admin';
  // Un profesional solo puede publicar sus propias horas — solo el admin
  // puede publicarlas a nombre de otro profesional.
  const finalProfessionalId = isAdmin && professionalId ? professionalId : req.user!.sub;

  const chair = await prisma.chair.findUnique({ where: { id: chairId } });
  if (!chair || !chair.active || chair.clinicaId !== clinicaId) {
    return res.status(400).json({ error: 'El sillón seleccionado no existe o no está activo' });
  }

  const [overlappingSlot, overlappingAppointment] = await Promise.all([
    prisma.openSlot.findFirst({
      where: { chairId, status: 'abierta', startAt: { lt: end }, endAt: { gt: start } },
    }),
    prisma.appointment.findFirst({
      where: { chairId, status: { not: 'cancelada' }, startAt: { lt: end }, endAt: { gt: start } },
    }),
  ]);
  if (overlappingSlot || overlappingAppointment) {
    return res.status(409).json({ error: 'Ese sillón ya tiene una hora ocupada o publicada en ese horario' });
  }

  const openSlot = await prisma.openSlot.create({
    data: { clinicaId, chairId, professionalId: finalProfessionalId, startAt: start, endAt: end, createdByUserId: req.user!.sub },
    include,
  });
  return res.status(201).json({ openSlot });
}

export async function remove(req: Request<{ id: string }>, res: Response) {
  const openSlot = await prisma.openSlot.findUnique({ where: { id: req.params.id } });
  if (!openSlot || openSlot.clinicaId !== req.user!.clinicaId) {
    return res.status(404).json({ error: 'Hora publicada no encontrada' });
  }
  if (openSlot.status !== 'abierta') {
    return res.status(409).json({ error: 'Esta hora ya fue tomada, no se puede cancelar así — cancela la cita en su lugar' });
  }
  const isAdmin = req.user!.role === 'admin';
  if (!isAdmin && openSlot.createdByUserId !== req.user!.sub) {
    return res.status(403).json({ error: 'No puedes cancelar una hora publicada por otro profesional' });
  }

  await prisma.openSlot.update({ where: { id: openSlot.id }, data: { status: 'cancelada' } });
  return res.status(204).send();
}
