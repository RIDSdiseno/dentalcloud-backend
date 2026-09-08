import type { Request, Response } from 'express';
import prisma from '../lib/prisma';

export const FORMAT_TYPES = ['presupuesto', 'examenes', 'plan_tratamiento', 'receta'] as const;
export type FormatType = (typeof FORMAT_TYPES)[number];

export async function list(req: Request, res: Response) {
  const clinicaId = req.user!.clinicaId!;
  const formats = await prisma.documentFormat.findMany({
    where: { clinicaId },
    orderBy: { updatedAt: 'desc' },
  });
  return res.json({ formats });
}

export async function create(req: Request, res: Response) {
  const clinicaId = req.user!.clinicaId!;
  const { name, type } = req.body as { name?: string; type?: string };
  if (!name?.trim()) {
    return res.status(400).json({ error: 'El nombre es requerido' });
  }
  if (!type || !FORMAT_TYPES.includes(type as FormatType)) {
    return res.status(400).json({ error: 'Tipo de formato no válido' });
  }
  const format = await prisma.documentFormat.create({
    data: { clinicaId, name: name.trim(), type, body: '' },
  });
  return res.status(201).json({ format });
}

export async function update(req: Request<{ id: string }>, res: Response) {
  const clinicaId = req.user!.clinicaId!;
  const { name, body } = req.body as { name?: string; body?: string };
  const existing = await prisma.documentFormat.findFirst({ where: { id: req.params.id, clinicaId } });
  if (!existing) {
    return res.status(404).json({ error: 'Formato no encontrado' });
  }
  const format = await prisma.documentFormat.update({
    where: { id: existing.id },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(body !== undefined ? { body } : {}),
    },
  });
  return res.json({ format });
}

export async function remove(req: Request<{ id: string }>, res: Response) {
  const clinicaId = req.user!.clinicaId!;
  const existing = await prisma.documentFormat.findFirst({ where: { id: req.params.id, clinicaId } });
  if (!existing) {
    return res.status(404).json({ error: 'Formato no encontrado' });
  }
  await prisma.documentFormat.delete({ where: { id: existing.id } });
  return res.status(204).end();
}
