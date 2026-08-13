import type { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { TREATMENT_STATUSES } from '../utils/treatmentStatus';
import {
  TREATMENT_PLAN_INCLUDE as include,
  recalculatePlan,
  lifecycleStampsForManualStatusChange,
  isPlanAlta,
} from '../lib/treatmentPlanLifecycle';
import {
  assertCloudinaryConfigured,
  CloudinaryNotConfiguredError,
  deleteImageFromCloudinary,
  uploadImageToCloudinary,
} from '../lib/cloudinaryUpload';
import { buildTreatmentPlanReportPdf } from '../lib/treatmentPlanReportPdf';
import { buildTreatmentPlanReportDocx } from '../lib/treatmentPlanReportDocx';

type ItemInput = {
  description?: string;
  cost?: number;
  prestacionId?: string;
  toothNumber?: string;
  listPrice?: number;
  convenioDiscountPercent?: number;
  notes?: string;
  productName?: string;
  productLot?: string;
  productExpiresAt?: string;
  productQuantity?: string;
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
  diagramType?: string;
  items?: ItemInput[];
  facialAnnotations?: unknown;
  facialGender?: string;
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

  const clinica = await prisma.clinica.findUnique({ where: { id: clinicaId }, select: { tipo: true } });
  let diagramType: string;
  if (clinica?.tipo === 'ambas') {
    if (body.diagramType !== 'dental' && body.diagramType !== 'estetica') {
      return res.status(400).json({ error: 'Debes indicar si el plan usa odontograma o mapa facial' });
    }
    diagramType = body.diagramType;
  } else {
    diagramType = clinica?.tipo === 'estetica' ? 'estetica' : 'dental';
  }

  const plan = await prisma.treatmentPlan.create({
    data: {
      patientId: body.patientId,
      professionalId,
      // Quién efectivamente creó el registro (usuario logueado) — distinto de
      // `professionalId`, que un admin puede asignar a otro profesional.
      createdById: req.user!.sub,
      sucursalId: body.sucursalId || null,
      previsionId: body.previsionId || null,
      convenioId: body.convenioId || null,
      name: body.name?.trim() || null,
      paymentMethod: body.paymentMethod?.trim() || null,
      amount,
      notes: body.notes?.trim() || null,
      diagramType,
      facialAnnotations: body.facialAnnotations === undefined ? undefined : (body.facialAnnotations as object),
      facialGender: body.facialGender === 'hombre' || body.facialGender === 'mujer' ? body.facialGender : null,
      createdByUserId: req.user!.sub,
      clinicaId,
      items: {
        // Todos los ítems se crean en la misma transacción y por lo tanto
        // compartirían el mismo `createdAt` (ver nota del `orderBy` más abajo)
        // — se escalona 1ms por índice para que el orden de la lista refleje
        // el orden en que se ingresaron en el formulario.
        create: items.map((i, index) => ({
          description: i.description!.trim(),
          cost: Math.round(i.cost ?? 0),
          prestacionId: i.prestacionId || null,
          toothNumber: i.toothNumber?.trim() || null,
          listPrice: Math.round(i.listPrice ?? i.cost ?? 0),
          convenioDiscountPercent: Math.round(i.convenioDiscountPercent ?? 0),
          notes: i.notes?.trim() || null,
          productName: i.productName?.trim() || null,
          productLot: i.productLot?.trim() || null,
          productExpiresAt: i.productExpiresAt ? new Date(i.productExpiresAt) : null,
          productQuantity: i.productQuantity?.trim() || null,
          clinicaId,
          createdAt: new Date(Date.now() + index),
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
  if (isPlanAlta(plan)) {
    return res.status(403).json({ error: 'Este presupuesto está de alta y ya no se puede modificar' });
  }
  if (body.status && !TREATMENT_STATUSES.includes(body.status)) {
    return res.status(400).json({ error: `El estado debe ser uno de: ${TREATMENT_STATUSES.join(', ')}` });
  }

  const updated = await prisma.treatmentPlan.update({
    where: { id: req.params.id },
    data: {
      ...(body.status ? { status: body.status, ...lifecycleStampsForManualStatusChange(plan, body.status, req.user!.sub) } : {}),
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
  if (isPlanAlta(plan)) {
    return res.status(403).json({ error: 'Este presupuesto está de alta y ya no se puede eliminar' });
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
  if (isPlanAlta(plan)) {
    return res.status(403).json({ error: 'Este presupuesto está de alta y ya no se puede modificar' });
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
      notes: body.notes?.trim() || null,
      productName: body.productName?.trim() || null,
      productLot: body.productLot?.trim() || null,
      productExpiresAt: body.productExpiresAt ? new Date(body.productExpiresAt) : null,
      productQuantity: body.productQuantity?.trim() || null,
      clinicaId: plan.clinicaId,
    },
  });

  const updated = await recalculatePlan(plan.id, req.user!.sub);
  return res.status(201).json({ plan: updated });
}

// Motivo por el que se modifica un presupuesto que ya está "en tratamiento"
// (pedido explícito para dejar trazabilidad de quién y por qué) — se guarda
// como una fila nueva, no se sobrescribe un solo campo, porque un presupuesto
// se puede modificar más de una vez.
export async function addEdit(req: Request<{ id: string }>, res: Response) {
  const body = req.body as { reason?: string };
  if (!body.reason?.trim()) {
    return res.status(400).json({ error: 'El motivo de la modificación es requerido' });
  }

  const plan = await prisma.treatmentPlan.findUnique({ where: { id: req.params.id } });
  if (!plan) {
    return res.status(404).json({ error: 'Presupuesto no encontrado' });
  }
  if (isPlanAlta(plan)) {
    return res.status(403).json({ error: 'Este presupuesto está de alta y ya no se puede modificar' });
  }

  const edit = await prisma.treatmentPlanEdit.create({
    data: {
      treatmentPlanId: plan.id,
      reason: body.reason.trim(),
      userId: req.user!.sub,
      clinicaId: plan.clinicaId,
    },
    include: { user: { select: { id: true, name: true } } },
  });
  return res.status(201).json({ edit });
}

export async function uploadPlanPhoto(req: Request<{ id: string }>, res: Response) {
  const plan = await prisma.treatmentPlan.findUnique({ where: { id: req.params.id } });
  if (!plan) {
    return res.status(404).json({ error: 'Presupuesto no encontrado' });
  }
  if (isPlanAlta(plan)) {
    return res.status(403).json({ error: 'Este presupuesto está de alta y ya no se puede modificar' });
  }
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'Se requiere un archivo' });
  }
  try {
    assertCloudinaryConfigured();
  } catch (err) {
    if (err instanceof CloudinaryNotConfiguredError) return res.status(503).json({ error: err.message });
    throw err;
  }
  const label = typeof req.body?.label === 'string' ? req.body.label.trim() : '';

  try {
    const uploaded = await uploadImageToCloudinary(file.buffer, `dentalcloud/${plan.clinicaId}/treatment-plans/${plan.id}`);

    const photoCount = await prisma.treatmentPlanPhoto.count({ where: { treatmentPlanId: plan.id } });
    await prisma.treatmentPlanPhoto.create({
      data: {
        treatmentPlanId: plan.id,
        url: uploaded.url,
        publicId: uploaded.publicId,
        label: label || null,
        position: photoCount,
        clinicaId: plan.clinicaId,
      },
    });

    const updated = await prisma.treatmentPlan.update({ where: { id: plan.id }, data: {}, include });
    return res.status(201).json({ plan: updated });
  } catch (err) {
    console.error('Error subiendo foto a Cloudinary', err);
    return res.status(502).json({ error: 'No se pudo subir la foto. Intenta nuevamente.' });
  }
}

export async function removePlanPhoto(req: Request<{ photoId: string }>, res: Response) {
  const photo = await prisma.treatmentPlanPhoto.findUnique({
    where: { id: req.params.photoId },
    include: { treatmentPlan: { select: { status: true } } },
  });
  if (!photo) {
    return res.status(404).json({ error: 'Foto no encontrada' });
  }
  if (isPlanAlta(photo.treatmentPlan)) {
    return res.status(403).json({ error: 'Este presupuesto está de alta y ya no se puede modificar' });
  }

  await deleteImageFromCloudinary(photo.publicId);

  await prisma.treatmentPlanPhoto.delete({ where: { id: photo.id } });
  const updated = await prisma.treatmentPlan.update({ where: { id: photo.treatmentPlanId }, data: {}, include });
  return res.json({ plan: updated });
}

// Informe descargable (PDF o DOCX) de un presupuesto "de alta" — resumen del
// paciente, prestaciones realizadas y fotos (plantilla + de cada
// procedimiento). Solo tiene sentido una vez dado de alta (antes el
// tratamiento sigue en curso), así que se exige ese estado igual que el
// resto de las acciones de este presupuesto.
export async function getReport(req: Request<{ id: string }>, res: Response) {
  const format = req.query.format === 'docx' ? 'docx' : 'pdf';

  const plan = await prisma.treatmentPlan.findUnique({ where: { id: req.params.id }, include });
  if (!plan) {
    return res.status(404).json({ error: 'Presupuesto no encontrado' });
  }
  if (!isPlanAlta(plan)) {
    return res.status(403).json({ error: 'El informe solo está disponible una vez que el presupuesto está de alta' });
  }

  const [patient, clinica] = await Promise.all([
    prisma.patient.findUnique({ where: { id: plan.patientId } }),
    prisma.clinica.findUnique({ where: { id: plan.clinicaId } }),
  ]);
  if (!patient) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }

  const photos = [
    ...plan.photos.map((p) => ({ url: p.url, label: p.label })),
    ...plan.items.flatMap((item) => item.photos.map((p) => ({ url: p.url, label: p.label ? `${item.description} — ${p.label}` : item.description }))),
  ];

  const input = {
    clinica: { name: clinica?.name ?? '', logoUrl: clinica?.logoUrl ?? null },
    patient: { firstName: patient.firstName, lastName: patient.lastName, rut: patient.rut, birthDate: patient.birthDate },
    plan: {
      number: plan.number,
      name: plan.name,
      status: plan.status,
      amount: plan.amount,
      notes: plan.notes,
      createdAt: plan.createdAt,
      completedAt: plan.completedAt,
      professional: plan.professional ? { name: plan.professional.name } : null,
      sucursal: plan.sucursal ? { name: plan.sucursal.name } : null,
      convenio: plan.convenio ? { name: plan.convenio.name } : null,
      prevision: plan.prevision ? { name: plan.prevision.name } : null,
    },
    items: plan.items.map((item) => ({
      description: item.description,
      toothNumber: item.toothNumber,
      cost: item.cost,
      completed: item.completed,
      treatedAt: item.treatedAt,
      treatedBy: item.treatedBy ? { name: item.treatedBy.name } : null,
      notes: item.notes,
    })),
    photos,
  };

  const fileNameBase = `informe-presupuesto-${plan.number}`;
  if (format === 'docx') {
    const buffer = await buildTreatmentPlanReportDocx(input);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${fileNameBase}.docx"`);
    return res.send(buffer);
  }

  const buffer = await buildTreatmentPlanReportPdf(input);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${fileNameBase}.pdf"`);
  return res.send(buffer);
}
