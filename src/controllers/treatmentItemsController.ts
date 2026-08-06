import type { Request, Response } from 'express';
import prisma from '../lib/prisma';
import cloudinary from '../lib/cloudinary';
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
    include: {
      prestacion: true,
      treatedBy: { select: { id: true, name: true } },
      photos: { orderBy: { createdAt: 'asc' as const } },
    },
  },
  photos: { orderBy: { position: 'asc' as const } },
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
    productName?: string | null;
    productLot?: string | null;
    productExpiresAt?: string | null;
    productQuantity?: string | null;
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
      ...(body.productName !== undefined ? { productName: body.productName?.trim() || null } : {}),
      ...(body.productLot !== undefined ? { productLot: body.productLot?.trim() || null } : {}),
      ...(body.productExpiresAt !== undefined
        ? { productExpiresAt: body.productExpiresAt ? new Date(body.productExpiresAt) : null }
        : {}),
      ...(body.productQuantity !== undefined ? { productQuantity: body.productQuantity?.trim() || null } : {}),
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

export async function uploadPhoto(req: Request<{ id: string }>, res: Response) {
  const item = await prisma.treatmentItem.findUnique({ where: { id: req.params.id } });
  if (!item) {
    return res.status(404).json({ error: 'Procedimiento no encontrado' });
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
        { resource_type: 'image', folder: `dentalcloud/${item.clinicaId}/treatment-items/${item.id}` },
        (error, result) => {
          if (error || !result) return reject(error);
          resolve(result as { secure_url: string; public_id: string });
        }
      );
      stream.end(file.buffer);
    });

    await prisma.treatmentItemPhoto.create({
      data: {
        treatmentItemId: item.id,
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        label: label || null,
        clinicaId: item.clinicaId,
      },
    });

    const plan = await recalculatePlan(item.treatmentPlanId);
    return res.status(201).json({ plan });
  } catch (err) {
    console.error('Error subiendo foto a Cloudinary', err);
    return res.status(502).json({ error: 'No se pudo subir la foto. Intenta nuevamente.' });
  }
}

export async function removePhoto(req: Request<{ photoId: string }>, res: Response) {
  const photo = await prisma.treatmentItemPhoto.findUnique({ where: { id: req.params.photoId } });
  if (!photo) {
    return res.status(404).json({ error: 'Foto no encontrada' });
  }

  try {
    await cloudinary.uploader.destroy(photo.publicId, { resource_type: 'image' });
  } catch (err) {
    console.error('Error eliminando foto de Cloudinary', err);
  }

  const item = await prisma.treatmentItem.findUniqueOrThrow({ where: { id: photo.treatmentItemId } });
  await prisma.treatmentItemPhoto.delete({ where: { id: photo.id } });
  const plan = await recalculatePlan(item.treatmentPlanId);
  return res.json({ plan });
}
