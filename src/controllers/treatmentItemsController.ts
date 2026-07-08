import type { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { computeTreatmentStatus } from '../utils/treatmentStatus';

const include = {
  professional: { select: { id: true, name: true } },
  sucursal: true,
  prevision: true,
  convenio: true,
  items: { orderBy: { createdAt: 'asc' as const }, include: { prestacion: true } },
} as const;

async function recalculatePlan(treatmentPlanId: string) {
  const plan = await prisma.treatmentPlan.findUniqueOrThrow({ where: { id: treatmentPlanId } });
  const items = await prisma.treatmentItem.findMany({ where: { treatmentPlanId } });
  const amount = items.reduce((sum, i) => sum + i.cost, 0);
  const status = computeTreatmentStatus(items, plan.status);
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
      ...(body.completed !== undefined ? { completed: body.completed } : {}),
      ...(body.toothNumber !== undefined ? { toothNumber: body.toothNumber?.trim() || null } : {}),
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
