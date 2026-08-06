import type { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { computeTreatmentStatus } from '../utils/treatmentStatus';

const include = {
  professional: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  sucursal: true,
  prevision: true,
  convenio: true,
  // Los ítems creados junto con el plan comparten el mismo `createdAt` (misma
  // transacción) — sin un segundo criterio de desempate, el orden de un empate
  // no es estable entre consultas y cambia con cada UPDATE (nueva versión
  // física de la fila). `id` nunca cambia, así que fija el orden visual.
  items: {
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
    include: { prestacion: true, treatedBy: { select: { id: true, name: true } } },
  },
};

async function recalculatePlan(treatmentPlanId: string) {
  const plan = await prisma.treatmentPlan.findUniqueOrThrow({
    where: { id: treatmentPlanId },
    include: { items: true },
  });
  const amount = plan.items.reduce((sum, i) => sum + i.cost, 0);
  const status = computeTreatmentStatus(plan.items, plan.status);
  return prisma.treatmentPlan.update({
    where: { id: treatmentPlanId },
    data: { amount, status },
    include,
  });
}

export async function update(req: Request<{ id: string }>, res: Response) {
  const body = req.body as {
    description?: string;
    cost?: number;
    completed?: boolean;
    toothNumber?: string | null;
    notes?: string | null;
  };
  const item = await prisma.treatmentItem.findUnique({ where: { id: req.params.id } });
  if (!item) {
    return res.status(404).json({ error: 'Procedimiento no encontrado' });
  }

  await prisma.treatmentItem.update({
    where: { id: item.id },
    data: {
      ...(body.description !== undefined ? { description: body.description.trim() } : {}),
      ...(body.cost !== undefined ? { cost: Math.round(body.cost) } : {}),
      ...(body.completed !== undefined
        ? {
            completed: body.completed,
            // Quién trató el procedimiento se registra solo (el usuario que
            // marca el check), no requiere un selector aparte. Se limpia si
            // se desmarca, para no dejar un "tratado por" de algo que en
            // realidad no quedó hecho.
            treatedById: body.completed ? req.user!.sub : null,
            treatedAt: body.completed ? new Date() : null,
          }
        : {}),
      ...(body.toothNumber !== undefined ? { toothNumber: body.toothNumber?.trim() || null } : {}),
      ...(body.notes !== undefined ? { notes: body.notes?.trim() || null } : {}),
    },
  });

  const plan = await recalculatePlan(item.treatmentPlanId);
  return res.json({ plan });
}

export async function remove(req: Request<{ id: string }>, res: Response) {
  const item = await prisma.treatmentItem.findUnique({ where: { id: req.params.id } });
  if (!item) {
    return res.status(404).json({ error: 'Procedimiento no encontrado' });
  }

  const treatmentPlanId = item.treatmentPlanId;
  await prisma.treatmentItem.delete({ where: { id: item.id } });
  const plan = await recalculatePlan(treatmentPlanId);
  return res.json({ plan });
}
