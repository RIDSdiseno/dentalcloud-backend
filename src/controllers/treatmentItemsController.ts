import type { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { recalculatePlan, isPlanAlta } from '../lib/treatmentPlanLifecycle';
import { belongsToRequesterClinica } from '../lib/tenantGuard';
import {
  assertCloudinaryConfigured,
  CloudinaryNotConfiguredError,
  deleteImageFromCloudinary,
  uploadImageToCloudinary,
} from '../lib/cloudinaryUpload';
import {
  syncTreatmentItemPhotoRemovalToFederation,
  syncTreatmentItemPhotoToFederation,
  syncTreatmentItemRemovalToFederation,
  syncTreatmentItemToFederation,
} from '../lib/federationSync';

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
    productoMarcaId?: string | null;
    productUnitQuantity?: number | null;
  };
  const item = await prisma.treatmentItem.findUnique({
    where: { id: req.params.id },
    include: { treatmentPlan: { select: { status: true } } },
  });
  if (!item || !belongsToRequesterClinica(item, req)) {
    return res.status(404).json({ error: 'Procedimiento no encontrado' });
  }
  if (isPlanAlta(item.treatmentPlan)) {
    return res.status(403).json({ error: 'Este presupuesto está de alta y ya no se puede modificar' });
  }

  // Etapa 08: mismo candado que al crear el ítem — si viene un producto del
  // catálogo multimarca, el costo se recalcula acá y no se confía en lo que
  // mande el frontend.
  let computedCost: number | null = null;
  let productoMarcaUpdate: { productoMarcaId: string | null; productUnitQuantity: number | null } | null = null;
  if (body.productoMarcaId !== undefined) {
    if (body.productoMarcaId === null) {
      productoMarcaUpdate = { productoMarcaId: null, productUnitQuantity: null };
    } else {
      const producto = await prisma.productoMarca.findUnique({ where: { id: body.productoMarcaId } });
      if (!producto || !belongsToRequesterClinica(producto, req)) {
        return res.status(400).json({ error: 'Producto no encontrado' });
      }
      const quantity = Math.max(1, Math.round(body.productUnitQuantity ?? 1));
      computedCost = producto.precioVenta * quantity;
      productoMarcaUpdate = { productoMarcaId: producto.id, productUnitQuantity: quantity };
    }
  }

  const updatedItem = await prisma.treatmentItem.update({
    where: { id: item.id },
    data: {
      ...(body.description !== undefined ? { description: body.description.trim() } : {}),
      ...(computedCost !== null ? { cost: computedCost, listPrice: computedCost } : body.cost !== undefined ? { cost: Math.round(body.cost) } : {}),
      ...(productoMarcaUpdate ?? {}),
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

  syncTreatmentItemToFederation(updatedItem).catch((err) => {
    console.error('No se pudo sincronizar la edición del procedimiento con Dental-Demo-Back', err);
  });

  const plan = await recalculatePlan(item.treatmentPlanId, req.user!.sub);
  return res.json({ plan });
}

export async function remove(req: Request<{ id: string }>, res: Response) {
  const item = await prisma.treatmentItem.findUnique({
    where: { id: req.params.id },
    include: { treatmentPlan: { select: { status: true } } },
  });
  if (!item || !belongsToRequesterClinica(item, req)) {
    return res.status(404).json({ error: 'Procedimiento no encontrado' });
  }
  if (isPlanAlta(item.treatmentPlan)) {
    return res.status(403).json({ error: 'Este presupuesto está de alta y ya no se puede modificar' });
  }

  const treatmentPlanId = item.treatmentPlanId;
  await prisma.treatmentItem.delete({ where: { id: item.id } });

  syncTreatmentItemRemovalToFederation(item).catch((err) => {
    console.error('No se pudo sincronizar la eliminación del procedimiento con Dental-Demo-Back', err);
  });

  const plan = await recalculatePlan(treatmentPlanId, req.user!.sub);
  return res.json({ plan });
}

export async function uploadPhoto(req: Request<{ id: string }>, res: Response) {
  const item = await prisma.treatmentItem.findUnique({
    where: { id: req.params.id },
    include: { treatmentPlan: { select: { status: true } } },
  });
  if (!item || !belongsToRequesterClinica(item, req)) {
    return res.status(404).json({ error: 'Procedimiento no encontrado' });
  }
  if (isPlanAlta(item.treatmentPlan)) {
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
    const uploaded = await uploadImageToCloudinary(file.buffer, `dentalcloud/${item.clinicaId}/treatment-items/${item.id}`);

    const photo = await prisma.treatmentItemPhoto.create({
      data: {
        treatmentItemId: item.id,
        url: uploaded.url,
        publicId: uploaded.publicId,
        label: label || null,
        clinicaId: item.clinicaId,
      },
    });
    syncTreatmentItemPhotoToFederation(photo).catch((err) => {
      console.error('No se pudo sincronizar la foto del procedimiento con Dental-Demo-Back', err);
    });

    const plan = await recalculatePlan(item.treatmentPlanId, req.user!.sub);
    return res.status(201).json({ plan });
  } catch (err) {
    console.error('Error subiendo foto a Cloudinary', err);
    return res.status(502).json({ error: 'No se pudo subir la foto. Intenta nuevamente.' });
  }
}

export async function removePhoto(req: Request<{ photoId: string }>, res: Response) {
  const photo = await prisma.treatmentItemPhoto.findUnique({
    where: { id: req.params.photoId },
    include: { treatmentItem: { select: { treatmentPlanId: true, treatmentPlan: { select: { status: true } } } } },
  });
  if (!photo || !belongsToRequesterClinica(photo, req)) {
    return res.status(404).json({ error: 'Foto no encontrada' });
  }
  if (isPlanAlta(photo.treatmentItem.treatmentPlan)) {
    return res.status(403).json({ error: 'Este presupuesto está de alta y ya no se puede modificar' });
  }

  await deleteImageFromCloudinary(photo.publicId);
  syncTreatmentItemPhotoRemovalToFederation(photo.id).catch((err) => {
    console.error('No se pudo sincronizar el borrado de la foto con Dental-Demo-Back', err);
  });

  const item = await prisma.treatmentItem.findUniqueOrThrow({ where: { id: photo.treatmentItemId } });
  await prisma.treatmentItemPhoto.delete({ where: { id: photo.id } });
  const plan = await recalculatePlan(item.treatmentPlanId, req.user!.sub);
  return res.json({ plan });
}
