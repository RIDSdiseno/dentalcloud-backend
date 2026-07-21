import type { Request, Response } from 'express';
import prisma from '../lib/prisma';

const MOVEMENT_TYPES = ['abono', 'interes', 'ajuste'];
const TYPE_LABELS: Record<string, string> = { abono: 'Abono', interes: 'Interés', ajuste: 'Ajuste' };

const movementInclude = {
  registeredBy: { select: { id: true, name: true } },
  treatmentPlan: { select: { id: true, number: true, name: true } },
} as const;

export async function summary(req: Request, res: Response) {
  const patientId = typeof req.query.patientId === 'string' ? req.query.patientId : undefined;
  if (!patientId) {
    return res.status(400).json({ error: 'Se requiere patientId' });
  }

  const [plans, movements] = await Promise.all([
    prisma.treatmentPlan.findMany({ where: { patientId }, orderBy: { createdAt: 'asc' } }),
    prisma.ledgerMovement.findMany({
      where: { patientId },
      include: movementInclude,
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const planRows = plans.map((plan) => {
    const planMovements = movements.filter((m) => m.treatmentPlanId === plan.id);
    const interes = planMovements.filter((m) => m.type === 'interes').reduce((sum, m) => sum + m.debe, 0);
    const ajustesNet = planMovements
      .filter((m) => m.type === 'ajuste')
      .reduce((sum, m) => sum + m.debe - m.haber, 0);
    const abonado = planMovements.filter((m) => m.type === 'abono').reduce((sum, m) => sum + m.haber, 0);
    const total = plan.amount + interes + ajustesNet;
    const saldo = total - abonado;
    return {
      id: plan.id,
      number: plan.number,
      name: plan.name,
      createdAt: plan.createdAt,
      subtotal: plan.amount,
      interes,
      ajustes: ajustesNet,
      total,
      abonado,
      saldo,
    };
  });

  const totals = planRows.reduce(
    (acc, row) => ({
      subtotal: acc.subtotal + row.subtotal,
      interes: acc.interes + row.interes,
      ajustes: acc.ajustes + row.ajustes,
      total: acc.total + row.total,
      abonado: acc.abonado + row.abonado,
      saldo: acc.saldo + row.saldo,
    }),
    { subtotal: 0, interes: 0, ajustes: 0, total: 0, abonado: 0, saldo: 0 }
  );

  const abonosLibres = movements.filter((m) => m.type === 'abono' && !m.treatmentPlanId);
  const intereses = movements.filter((m) => m.type === 'interes');
  const ajustes = movements.filter((m) => m.type === 'ajuste');

  const ledger = [
    ...plans.map((plan) => ({
      id: `plan-${plan.id}`,
      comprobante: 'Presupuesto',
      number: plan.number,
      createdAt: plan.createdAt,
      debe: plan.amount,
      haber: 0,
      planNumber: plan.number,
      description: plan.name || `Presupuesto N° ${plan.number}`,
      paymentMethod: null as string | null,
      documentNumber: null as string | null,
      notes: null as string | null,
      deletable: false,
    })),
    ...movements.map((m) => ({
      id: m.id,
      comprobante: TYPE_LABELS[m.type] ?? m.type,
      number: m.number,
      createdAt: m.createdAt,
      debe: m.debe,
      haber: m.haber,
      planNumber: m.treatmentPlan?.number ?? null,
      description: m.description,
      paymentMethod: m.paymentMethod,
      documentNumber: m.documentNumber,
      notes: m.notes,
      deletable: true,
    })),
  ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const abonosLibresTotal = abonosLibres.reduce((sum, m) => sum + m.haber, 0);
  const saldoTotal = ledger.reduce((sum, row) => sum + row.debe - row.haber, 0);

  return res.json({
    plans: planRows,
    totals,
    abonosLibres,
    intereses,
    ajustes,
    ledger,
    abonosLibresTotal,
    saldoTotal,
  });
}

export async function createMovement(req: Request, res: Response) {
  const body = req.body as {
    patientId?: string;
    treatmentPlanId?: string;
    type?: string;
    amount?: number;
    direction?: 'debe' | 'haber';
    description?: string;
    paymentMethod?: string;
    documentNumber?: string;
    notes?: string;
  };

  if (!body.patientId) {
    return res.status(400).json({ error: 'patientId es requerido' });
  }
  if (!body.type || !MOVEMENT_TYPES.includes(body.type)) {
    return res.status(400).json({ error: `type debe ser uno de: ${MOVEMENT_TYPES.join(', ')}` });
  }
  const amount = Math.round(body.amount ?? 0);
  if (amount <= 0) {
    return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
  }

  const patient = await prisma.patient.findUnique({ where: { id: body.patientId } });
  if (!patient) {
    return res.status(400).json({ error: 'El paciente seleccionado no existe' });
  }

  if (body.treatmentPlanId) {
    const plan = await prisma.treatmentPlan.findUnique({ where: { id: body.treatmentPlanId } });
    if (!plan || plan.patientId !== body.patientId) {
      return res.status(400).json({ error: 'El presupuesto seleccionado no es válido para este paciente' });
    }
  }

  let debe = 0;
  let haber = 0;
  if (body.type === 'abono') {
    haber = amount;
  } else if (body.type === 'interes') {
    debe = amount;
  } else {
    if (body.direction === 'haber') haber = amount;
    else debe = amount;
  }

  const movement = await prisma.ledgerMovement.create({
    data: {
      patientId: body.patientId,
      treatmentPlanId: body.treatmentPlanId || null,
      type: body.type,
      debe,
      haber,
      description: body.description?.trim() || null,
      paymentMethod: body.paymentMethod?.trim() || null,
      documentNumber: body.documentNumber?.trim() || null,
      notes: body.notes?.trim() || null,
      registeredById: req.user!.sub,
      clinicaId: req.user!.clinicaId!,
    },
    include: movementInclude,
  });
  return res.status(201).json({ movement });
}

export async function removeMovement(req: Request<{ id: string }>, res: Response) {
  const movement = await prisma.ledgerMovement.findUnique({ where: { id: req.params.id } });
  if (!movement) {
    return res.status(404).json({ error: 'Movimiento no encontrado' });
  }
  const isOwnerOrAdmin = req.user!.role === 'admin' || movement.registeredById === req.user!.sub;
  if (!isOwnerOrAdmin) {
    return res.status(403).json({ error: 'Solo quien registró el movimiento o un administrador puede eliminarlo' });
  }
  await prisma.ledgerMovement.delete({ where: { id: req.params.id } });
  return res.status(204).send();
}
