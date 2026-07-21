import type { Request, Response } from 'express';
import prisma from '../lib/prisma';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function toMinutes(time: string) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export async function list(req: Request, res: Response) {
  const professionalId = typeof req.query.professionalId === 'string' ? req.query.professionalId : undefined;

  const schedules = await prisma.workSchedule.findMany({
    where: professionalId ? { professionalId } : undefined,
    include: { chair: { select: { id: true, number: true, name: true } } },
    orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
  });
  return res.json({ schedules });
}

export async function create(req: Request, res: Response) {
  const { professionalId, chairId, weekday, startTime, endTime } = req.body as {
    professionalId?: string;
    chairId?: string;
    weekday?: number;
    startTime?: string;
    endTime?: string;
  };

  if (
    !professionalId ||
    weekday === undefined ||
    !Number.isInteger(weekday) ||
    weekday < 0 ||
    weekday > 6
  ) {
    return res.status(400).json({ error: 'professionalId y weekday (0-6) son requeridos' });
  }
  if (!startTime || !TIME_RE.test(startTime) || !endTime || !TIME_RE.test(endTime)) {
    return res.status(400).json({ error: 'startTime y endTime deben tener formato HH:MM' });
  }
  if (toMinutes(endTime) <= toMinutes(startTime)) {
    return res.status(400).json({ error: 'La hora de término debe ser posterior a la de inicio' });
  }

  const professional = await prisma.user.findUnique({ where: { id: professionalId } });
  if (!professional) {
    return res.status(400).json({ error: 'El profesional seleccionado no existe' });
  }
  if (chairId) {
    const chair = await prisma.chair.findUnique({ where: { id: chairId } });
    if (!chair) {
      return res.status(400).json({ error: 'El sillón seleccionado no existe' });
    }
  }

  const existing = await prisma.workSchedule.findMany({
    where: { professionalId, weekday },
  });
  const overlaps = existing.some(
    (block) => toMinutes(startTime) < toMinutes(block.endTime) && toMinutes(endTime) > toMinutes(block.startTime)
  );
  if (overlaps) {
    return res.status(409).json({ error: 'Ese horario se superpone con un bloque ya agregado' });
  }

  const schedule = await prisma.workSchedule.create({
    data: { professionalId, chairId: chairId || null, weekday, startTime, endTime, clinicaId: req.user!.clinicaId! },
    include: { chair: { select: { id: true, number: true, name: true } } },
  });
  return res.status(201).json({ schedule });
}

export async function remove(req: Request<{ id: string }>, res: Response) {
  const schedule = await prisma.workSchedule.findUnique({ where: { id: req.params.id } });
  if (!schedule) {
    return res.status(404).json({ error: 'Bloque de horario no encontrado' });
  }
  await prisma.workSchedule.delete({ where: { id: req.params.id } });
  return res.status(204).send();
}
