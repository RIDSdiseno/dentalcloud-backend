import type { Request, Response } from 'express';
import prisma from '../lib/prisma';
import cloudinary from '../lib/cloudinary';
import { TREATMENT_STATUSES, computeTreatmentStatus } from '../utils/treatmentStatus';

const include = {
  professional: { select: { id: true, name: true } },
  sucursal: true,
  prevision: true,
  convenio: true,
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: { prestacion: true, photos: { orderBy: { createdAt: 'asc' as const } } },
  },
  photos: { orderBy: { position: 'asc' as const } },
} as const;

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

export async function uploadPlanPhoto(req: Request<{ id: string }>, res: Response) {
  const plan = await prisma.treatmentPlan.findUnique({ where: { id: req.params.id } });
  if (!plan) {
    return res.status(404).json({ error: 'Presupuesto no encontrado' });
  }
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'Se requiere un archivo' });
  }
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    return res.status(503).json({
      error: 'La subida de fotos no está configurada. Falta CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET en el servidor.',
    });
  }
  const label = typeof req.body?.label === 'string' ? req.body.label.trim() : '';

  try {
    const uploadResult = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type: 'image', folder: `dentalcloud/${plan.clinicaId}/treatment-plans/${plan.id}` },
        (error, result) => {
          if (error || !result) return reject(error);
          resolve(result as { secure_url: string; public_id: string });
        }
      );
      stream.end(file.buffer);
    });

    const photoCount = await prisma.treatmentPlanPhoto.count({ where: { treatmentPlanId: plan.id } });
    await prisma.treatmentPlanPhoto.create({
      data: {
        treatmentPlanId: plan.id,
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id,
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
  const photo = await prisma.treatmentPlanPhoto.findUnique({ where: { id: req.params.photoId } });
  if (!photo) {
    return res.status(404).json({ error: 'Foto no encontrada' });
  }

  try {
    await cloudinary.uploader.destroy(photo.publicId, { resource_type: 'image' });
  } catch (err) {
    console.error('Error eliminando foto de Cloudinary', err);
  }

  await prisma.treatmentPlanPhoto.delete({ where: { id: photo.id } });
  const updated = await prisma.treatmentPlan.update({ where: { id: photo.treatmentPlanId }, data: {}, include });
  return res.json({ plan: updated });
}
