import type { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { TREATMENT_STATUSES, computeTreatmentStatus } from '../utils/treatmentStatus';

const include = {
  professional: { select: { id: true, name: true } },
  sucursal: true,
  prevision: true,
  convenio: true,
  items: { orderBy: { createdAt: 'asc' as const }, include: { prestacion: true } },
} as const;

type ItemInput = {
  description?: string;
  cost?: number;
  prestacionId?: string;
  toothNumber?: string;
  listPrice?: number;
  convenioDiscountPercent?: number;
};
type PlanInput = {
  patientId?: string;
  professionalId?: string;
  sucursalId?: string;
  previsionId?: string;
  convenioId?: string;
  name?: string;
  paymentMethod?: string;
  notes?: string;
  items?: ItemInput[];
};

export async function list(req: Request, res: Response) {
  const patientId = typeof req.query.patientId === 'string' ? req.query.patientId : undefined;
  if (!patientId) {
    return res.status(400).json({ error: 'Se requiere patientId' });
  }

  const plans = await prisma.treatmentPlan.findMany({
    where: { patientId },
    include,
    orderBy: { createdAt: 'desc' },
  });
  return res.json({ plans });
}

export async function create(req: Request, res: Response) {
  const body = req.body as PlanInput;
  if (!body.patientId) {
    return res.status(400).json({ error: 'patientId es requerido' });
  }

  const patient = await prisma.patient.findUnique({ where: { id: body.patientId } });
  if (!patient) {
    return res.status(400).json({ error: 'El paciente seleccionado no existe' });
  }

  let professionalId: string | null = req.user!.sub;
  if (body.professionalId) {
    const professional = await prisma.user.findUnique({ where: { id: body.professionalId } });
    if (!professional) {
      return res.status(400).json({ error: 'El profesional seleccionado no existe' });
    }
    professionalId = body.professionalId;
  }

  if (body.sucursalId) {
    const sucursal = await prisma.sucursal.findUnique({ where: { id: body.sucursalId } });
    if (!sucursal) {
      return res.status(400).json({ error: 'La sucursal seleccionada no existe' });
    }
  }
  if (body.previsionId) {
    const prevision = await prisma.prevision.findUnique({ where: { id: body.previsionId } });
    if (!prevision) {
      return res.status(400).json({ error: 'La previsión seleccionada no existe' });
    }
  }
  if (body.convenioId) {
    const convenio = await prisma.convenio.findUnique({ where: { id: body.convenioId } });
    if (!convenio) {
      return res.status(400).json({ error: 'El convenio seleccionado no existe' });
    }
  }

  const items = (body.items ?? []).filter((i) => i.description?.trim());
  const amount = items.reduce((sum, i) => sum + Math.round(i.cost ?? 0), 0);
  const clinicaId = req.user!.clinicaId!;

  const plan = await prisma.treatmentPlan.create({
    data: {
      patientId: body.patientId,
      professionalId,
      sucursalId: body.sucursalId || null,
      previsionId: body.previsionId || null,
      convenioId: body.convenioId || null,
      name: body.name?.trim() || null,
      paymentMethod: body.paymentMethod?.trim() || null,
      amount,
      notes: body.notes?.trim() || null,
      clinicaId,
      items: {
        create: items.map((i) => ({
          description: i.description!.trim(),
          cost: Math.round(i.cost ?? 0),
          prestacionId: i.prestacionId || null,
          toothNumber: i.toothNumber?.trim() || null,
          listPrice: Math.round(i.listPrice ?? i.cost ?? 0),
          convenioDiscountPercent: Math.round(i.convenioDiscountPercent ?? 0),
          clinicaId,
        })),
      },
    },
    include,
  });
  return res.status(201).json({ plan });
}

export async function update(req: Request<{ id: string }>, res: Response) {
  const body = req.body as {
    status?: string;
    notes?: string;
    professionalId?: string | null;
    name?: string;
    paymentMethod?: string | null;
  };
  const plan = await prisma.treatmentPlan.findUnique({ where: { id: req.params.id } });
  if (!plan) {
    return res.status(404).json({ error: 'Presupuesto no encontrado' });
  }
  if (body.status && !TREATMENT_STATUSES.includes(body.status)) {
    return res.status(400).json({ error: `El estado debe ser uno de: ${TREATMENT_STATUSES.join(', ')}` });
  }

  const updated = await prisma.treatmentPlan.update({
    where: { id: req.params.id },
    data: {
      ...(body.status ? { status: body.status } : {}),
      ...(body.notes !== undefined ? { notes: body.notes?.trim() || null } : {}),
      ...(body.professionalId !== undefined ? { professionalId: body.professionalId || null } : {}),
      ...(body.name !== undefined ? { name: body.name?.trim() || null } : {}),
      ...(body.paymentMethod !== undefined ? { paymentMethod: body.paymentMethod?.trim() || null } : {}),
    },
    include,
  });
  return res.json({ plan: updated });
}

export async function remove(req: Request<{ id: string }>, res: Response) {
  const plan = await prisma.treatmentPlan.findUnique({ where: { id: req.params.id } });
  if (!plan) {
    return res.status(404).json({ error: 'Presupuesto no encontrado' });
  }
  await prisma.treatmentPlan.delete({ where: { id: req.params.id } });
  return res.status(204).send();
}

export async function addItem(req: Request<{ id: string }>, res: Response) {
  const body = req.body as ItemInput;
  if (!body.description?.trim()) {
    return res.status(400).json({ error: 'La descripción del procedimiento es requerida' });
  }

  const plan = await prisma.treatmentPlan.findUnique({ where: { id: req.params.id } });
  if (!plan) {
    return res.status(404).json({ error: 'Presupuesto no encontrado' });
  }

  await prisma.treatmentItem.create({
    data: {
      treatmentPlanId: plan.id,
      description: body.description.trim(),
      cost: Math.round(body.cost ?? 0),
      prestacionId: body.prestacionId || null,
      toothNumber: body.toothNumber?.trim() || null,
      listPrice: Math.round(body.listPrice ?? body.cost ?? 0),
      convenioDiscountPercent: Math.round(body.convenioDiscountPercent ?? 0),
      clinicaId: plan.clinicaId,
    },
  });

  const items = await prisma.treatmentItem.findMany({ where: { treatmentPlanId: plan.id } });
  const amount = items.reduce((sum, i) => sum + i.cost, 0);
  const status = computeTreatmentStatus(items, plan.status);

  const updated = await prisma.treatmentPlan.update({
    where: { id: plan.id },
    data: { amount, status },
    include,
  });
  return res.status(201).json({ plan: updated });
}
