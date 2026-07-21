import type { Request, Response } from 'express';
import prisma from '../lib/prisma';

export async function list(req: Request, res: Response) {
  const includeInactive = req.query.all === 'true';
  const chairs = await prisma.chair.findMany({
    where: { clinicaId: req.user!.clinicaId!, ...(includeInactive ? {} : { active: true }) },
    orderBy: { number: 'asc' },
  });
  return res.json({ chairs });
}

export async function create(req: Request, res: Response) {
  const { number, name } = req.body as { number?: number; name?: string };

  if (!number || !Number.isInteger(number) || number <= 0) {
    return res.status(400).json({ error: 'El número de sillón debe ser un entero positivo' });
  }

  const clinicaId = req.user!.clinicaId!;
  const existing = await prisma.chair.findFirst({ where: { clinicaId, number } });
  if (existing) {
    return res.status(409).json({ error: `Ya existe un sillón con el número ${number}` });
  }

  const chair = await prisma.chair.create({ data: { number, name: name?.trim() || null, clinicaId } });
  return res.status(201).json({ chair });
}

export async function update(req: Request<{ id: string }>, res: Response) {
  const { id } = req.params;
  const { name, active } = req.body as { name?: string | null; active?: boolean };

  const chair = await prisma.chair.findUnique({ where: { id } });
  if (!chair) {
    return res.status(404).json({ error: 'Sillón no encontrado' });
  }

  const updated = await prisma.chair.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name: name?.trim() || null } : {}),
      ...(active !== undefined ? { active } : {}),
    },
  });
  return res.json({ chair: updated });
}

export async function remove(req: Request<{ id: string }>, res: Response) {
  const { id } = req.params;

  const chair = await prisma.chair.findUnique({ where: { id } });
  if (!chair) {
    return res.status(404).json({ error: 'Sillón no encontrado' });
  }

  const appointmentCount = await prisma.appointment.count({ where: { chairId: id } });
  if (appointmentCount > 0) {
    return res.status(409).json({
      error: 'No se puede eliminar un sillón con citas asociadas. Desactívalo en su lugar.',
    });
  }

  await prisma.chair.delete({ where: { id } });
  return res.status(204).send();
}
