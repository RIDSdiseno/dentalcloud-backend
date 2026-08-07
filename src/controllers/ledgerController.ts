import type { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { buildCartolaPdf } from '../lib/cartolaPdf';
import { sendMail } from '../lib/mailer';
import { buildDebtReminderEmailHtml } from '../lib/emailTemplates/debtReminderEmail';

const MOVEMENT_TYPES = ['abono', 'interes', 'ajuste'];
const TYPE_LABELS: Record<string, string> = { abono: 'Abono', interes: 'Interés', ajuste: 'Ajuste' };

const movementInclude = {
  registeredBy: { select: { id: true, name: true } },
  treatmentPlan: { select: { id: true, number: true, name: true } },
} as const;

async function computeSummaryData(patientId: string) {
  const [plans, movements] = await Promise.all([
    prisma.treatmentPlan.findMany({
      where: { patientId },
      include: { professional: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    }),
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
      professional: plan.professional?.name ?? null,
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

  return {
    plans: planRows,
    totals,
    abonosLibres,
    intereses,
    ajustes,
    ledger,
    abonosLibresTotal,
    saldoTotal,
  };
}

async function assertPatientAccess(req: Request, patientId: string) {
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient || (req.user!.role !== 'super_admin' && patient.clinicaId !== req.user!.clinicaId)) {
    return null;
  }
  return patient;
}

export async function summary(req: Request, res: Response) {
  const patientId = typeof req.query.patientId === 'string' ? req.query.patientId : undefined;
  if (!patientId) {
    return res.status(400).json({ error: 'Se requiere patientId' });
  }
  const patient = await assertPatientAccess(req, patientId);
  if (!patient) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }

  const data = await computeSummaryData(patientId);
  return res.json(data);
}

export async function summaryPdf(req: Request, res: Response) {
  const patientId = typeof req.query.patientId === 'string' ? req.query.patientId : undefined;
  if (!patientId) {
    return res.status(400).json({ error: 'Se requiere patientId' });
  }
  const patient = await assertPatientAccess(req, patientId);
  if (!patient) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }

  const clinica = await prisma.clinica.findUnique({ where: { id: patient.clinicaId } });
  const data = await computeSummaryData(patientId);

  const pdfBuffer = await buildCartolaPdf({
    clinica: { name: clinica?.name ?? '', logoUrl: clinica?.logoUrl ?? null },
    patient: { firstName: patient.firstName, lastName: patient.lastName, rut: patient.rut },
    ...data,
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="cartola-${patient.rut}.pdf"`);
  return res.send(pdfBuffer);
}

// Endpoint liviano para la notificación de saldo pendiente al abrir la ficha
// del paciente — evita traer todo el detalle de movimientos (que sí necesita
// la pestaña Cartola) solo para saber si el paciente debe o no.
export async function balance(req: Request, res: Response) {
  const patientId = typeof req.query.patientId === 'string' ? req.query.patientId : undefined;
  if (!patientId) {
    return res.status(400).json({ error: 'Se requiere patientId' });
  }
  const patient = await assertPatientAccess(req, patientId);
  if (!patient) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }

  const data = await computeSummaryData(patientId);
  return res.json({ saldoTotal: data.saldoTotal });
}

// Envía la cartola en PDF al correo del paciente — con lenguaje de
// recordatorio de pago si tiene saldo pendiente, o de cartola al día si no.
// Se usa tanto desde la notificación de deuda al abrir la ficha como desde un
// botón "Enviar por correo" directamente en la pestaña Cartola.
export async function sendCartolaEmail(req: Request, res: Response) {
  const patientId = typeof req.body.patientId === 'string' ? req.body.patientId : undefined;
  if (!patientId) {
    return res.status(400).json({ error: 'Se requiere patientId' });
  }
  const patient = await assertPatientAccess(req, patientId);
  if (!patient) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }
  if (!patient.email) {
    return res.status(400).json({ error: 'El paciente no tiene un correo registrado' });
  }

  const data = await computeSummaryData(patientId);

  const clinica = await prisma.clinica.findUnique({ where: { id: patient.clinicaId } });
  const html = buildDebtReminderEmailHtml({
    patientFirstName: patient.firstName,
    clinicaNombre: clinica?.name ?? '',
    clinicaLogoUrl: clinica?.logoUrl,
    saldoTotal: data.saldoTotal,
  });

  const pdfBuffer = await buildCartolaPdf({
    clinica: { name: clinica?.name ?? '', logoUrl: clinica?.logoUrl ?? null },
    patient: { firstName: patient.firstName, lastName: patient.lastName, rut: patient.rut },
    ...data,
  });

  const subject =
    data.saldoTotal > 0
      ? `Recordatorio de pago pendiente — ${clinica?.name ?? ''}`
      : `Tu cartola — ${clinica?.name ?? ''}`;

  try {
    await sendMail({
      to: patient.email,
      subject,
      html,
      attachments: [
        {
          filename: `cartola-${patient.rut}.pdf`,
          contentBytes: pdfBuffer.toString('base64'),
          contentType: 'application/pdf',
        },
      ],
    });
  } catch (err) {
    console.error('No se pudo enviar el recordatorio de pago', err);
    return res.status(502).json({ error: 'No se pudo enviar el correo. Intenta nuevamente.' });
  }

  return res.status(200).json({ sent: true });
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
