import type { Request, Response } from 'express';
import prisma from '../lib/prisma';

const include = {
  professional: { select: { id: true, name: true } },
} as const;

export async function list(req: Request, res: Response) {
  const patientId = typeof req.query.patientId === 'string' ? req.query.patientId : undefined;
  if (!patientId) {
    return res.status(400).json({ error: 'Se requiere patientId' });
  }

  const observations = await prisma.administrativeObservation.findMany({
    where: { patientId },
    include,
    orderBy: { createdAt: 'desc' },
  });
  return res.json({ observations });
}

export async function create(req: Request, res: Response) {
  const body = req.body as { patientId?: string; professionalId?: string; content?: string };
  if (!body.patientId) {
    return res.status(400).json({ error: 'patientId es requerido' });
  }
  if (!body.content?.trim()) {
    return res.status(400).json({ error: 'La observación no puede estar vacía' });
  }

  const patient = await prisma.patient.findUnique({ where: { id: body.patientId } });
  if (!patient) {
    return res.status(400).json({ error: 'El paciente seleccionado no existe' });
  }

  let professionalId = req.user!.sub;
  if (body.professionalId) {
    const professional = await prisma.user.findUnique({ where: { id: body.professionalId } });
    if (!professional) {
      return res.status(400).json({ error: 'El profesional seleccionado no existe' });
    }
    professionalId = body.professionalId;
  }

  const observation = await prisma.administrativeObservation.create({
    data: {
      patientId: body.patientId,
      professionalId,
      content: body.content.trim(),
      clinicaId: req.user!.clinicaId!,
    },
    include,
  });
  return res.status(201).json({ observation });
}

export async function remove(req: Request<{ id: string }>, res: Response) {
  const observation = await prisma.administrativeObservation.findUnique({ where: { id: req.params.id } });
  if (!observation) {
    return res.status(404).json({ error: 'Observación no encontrada' });
  }
  const isOwnerOrAdmin = req.user!.role === 'admin' || observation.professionalId === req.user!.sub;
  if (!isOwnerOrAdmin) {
    return res.status(403).json({ error: 'Solo el autor o un administrador pueden eliminar esta observación' });
  }
  await prisma.administrativeObservation.delete({ where: { id: req.params.id } });
  return res.status(204).send();
}
