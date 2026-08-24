import type { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { recalculatePlan, isPlanAlta } from '../lib/treatmentPlanLifecycle';
import { syncTreatmentItemToFederation } from '../lib/federationSync';
import {
  assertCloudinaryConfigured,
  CloudinaryNotConfiguredError,
  deleteImageFromCloudinary,
  uploadImageToCloudinary,
} from '../lib/cloudinaryUpload';

const include = {
  professional: { select: { id: true, name: true } },
  treatmentItem: { select: { id: true, description: true, treatmentPlanId: true } },
  photos: { orderBy: { createdAt: 'asc' as const } },
} as const;

function hasText(html: string) {
  return html.replace(/<[^>]*>/g, '').trim().length > 0;
}

// Solo el autor de la evolución o un admin pueden modificarla/eliminarla.
function isOwnerOrAdmin(evolution: { professionalId: string }, req: Request): boolean {
  return req.user!.role === 'admin' || evolution.professionalId === req.user!.sub;
}

export async function list(req: Request, res: Response) {
  const patientId = typeof req.query.patientId === 'string' ? req.query.patientId : undefined;
  if (!patientId) {
    return res.status(400).json({ error: 'Se requiere patientId' });
  }

  const professionalId = typeof req.query.professionalId === 'string' ? req.query.professionalId : undefined;
  const enabledFilter = typeof req.query.enabled === 'string' ? req.query.enabled : 'true';

  const evolutions = await prisma.evolution.findMany({
    where: {
      patientId,
      ...(professionalId ? { professionalId } : {}),
      ...(enabledFilter === 'all' ? {} : { enabled: enabledFilter === 'false' ? false : true }),
    },
    include,
    orderBy: { createdAt: 'desc' },
  });
  return res.json({ evolutions });
}

export async function create(req: Request, res: Response) {
  const body = req.body as {
    patientId?: string;
    professionalId?: string;
    content?: string;
    treatmentItemId?: string;
    productName?: string;
    productLot?: string;
    productExpiresAt?: string;
    productQuantity?: string;
  };
  if (!body.patientId) {
    return res.status(400).json({ error: 'patientId es requerido' });
  }
  if (!body.content || !hasText(body.content)) {
    return res.status(400).json({ error: 'El contenido de la evolución es requerido' });
  }

  const patient = await prisma.patient.findUnique({ where: { id: body.patientId } });
  if (!patient) {
    return res.status(400).json({ error: 'El paciente seleccionado no existe' });
  }

  let professionalId = req.user!.sub;
  if (body.professionalId) {
    const professional = await prisma.user.findUnique({ where: { id: body.professionalId } });
    if (!professional) {
      return res.status(400).json({ error: 'El profesional seleccionado no existe' });
    }
    professionalId = body.professionalId;
  }

  // Si la evolución documenta un procedimiento puntual del presupuesto, debe
  // pertenecer al mismo paciente — evita enlazar el procedimiento de otro
  // paciente por error (o por un id manipulado).
  let treatmentItem: { id: string; treatmentPlanId: string } | null = null;
  if (body.treatmentItemId) {
    const item = await prisma.treatmentItem.findUnique({
      where: { id: body.treatmentItemId },
      include: {
        treatmentPlan: { select: { patientId: true, status: true } },
        prestacion: { select: { requiresProductTracking: true } },
      },
    });
    if (!item || item.treatmentPlan.patientId !== body.patientId) {
      return res.status(400).json({ error: 'El procedimiento seleccionado no corresponde a este paciente' });
    }
    if (isPlanAlta(item.treatmentPlan)) {
      return res.status(403).json({ error: 'Este presupuesto está de alta y ya no se puede modificar' });
    }
    // Si la prestación exige trazabilidad, el producto/lote/vencimiento/cantidad
    // se vuelven obligatorios acá (no basta con dejarlos vacíos y completarlos después).
    if (item.prestacion?.requiresProductTracking) {
      const missing =
        !body.productName?.trim() || !body.productLot?.trim() || !body.productExpiresAt || !body.productQuantity?.trim();
      if (missing) {
        return res.status(400).json({
          error: 'Este procedimiento requiere registrar producto, lote, vencimiento y cantidad para poder evolucionarlo',
        });
      }
    }
    treatmentItem = item;
  }

  const productName = body.productName?.trim() || null;
  const productLot = body.productLot?.trim() || null;
  const productExpiresAt = body.productExpiresAt ? new Date(body.productExpiresAt) : null;
  const productQuantity = body.productQuantity?.trim() || null;

  const evolution = await prisma.evolution.create({
    data: {
      patientId: body.patientId,
      professionalId,
      content: body.content,
      treatmentItemId: treatmentItem?.id ?? null,
      productName,
      productLot,
      productExpiresAt,
      productQuantity,
      clinicaId: req.user!.clinicaId!,
    },
    include,
  });

  // El presupuesto puede venir de otro sistema (aún por integrar); lo que
  // realmente se hizo/usó se documenta acá, al evolucionar — no al
  // presupuestar. Evolucionar un procedimiento es lo que lo marca como
  // realizado (mismo efecto que tildar el checkbox a mano en el detalle del
  // presupuesto, ver treatmentItemsController.ts) y copia el producto/lote
  // al ítem para no romper las vistas de seguimiento que todavía leen desde
  // ahí (alertas de vencimiento, stickers, etc. en TreatmentPlanTab.tsx).
  if (treatmentItem) {
    const updatedItem = await prisma.treatmentItem.update({
      where: { id: treatmentItem.id },
      data: {
        completed: true,
        treatedById: professionalId,
        treatedAt: new Date(),
        ...(body.productName !== undefined ? { productName } : {}),
        ...(body.productLot !== undefined ? { productLot } : {}),
        ...(body.productExpiresAt !== undefined ? { productExpiresAt } : {}),
        ...(body.productQuantity !== undefined ? { productQuantity } : {}),
      },
    });
    await recalculatePlan(treatmentItem.treatmentPlanId, professionalId);
    // Sin esto, el producto/lote real (recién completado acá) y el estado
    // "completado" nunca llegan a Dental-Demo-Back — el espejo se queda
    // congelado con los datos placeholder de la creación del ítem.
    syncTreatmentItemToFederation(updatedItem).catch((err) => {
      console.error('No se pudo sincronizar el ítem evolucionado con Dental-Demo-Back', err);
    });
  }
  return res.status(201).json({ evolution });
}

export async function update(req: Request<{ id: string }>, res: Response) {
  const body = req.body as { content?: string; enabled?: boolean };
  const evolution = await prisma.evolution.findUnique({ where: { id: req.params.id } });
  if (!evolution) {
    return res.status(404).json({ error: 'Evolución no encontrada' });
  }

  if (!isOwnerOrAdmin(evolution, req)) {
    return res.status(403).json({ error: 'Solo el autor o un administrador pueden modificar esta evolución' });
  }

  if (body.content !== undefined && !hasText(body.content)) {
    return res.status(400).json({ error: 'El contenido de la evolución es requerido' });
  }

  const updated = await prisma.evolution.update({
    where: { id: req.params.id },
    data: {
      ...(body.content !== undefined ? { content: body.content } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
    },
    include,
  });
  return res.json({ evolution: updated });
}

// Se puede borrar una evolución, pero solo dando un motivo — queda una copia
// del contenido en `EvolutionDeletion` (auditoría) antes de borrarla de
// verdad. No revierte nada que ya se haya sincronizado al TreatmentItem
// (completed/producto/fotos) cuando la evolución documentaba un procedimiento
// — borrar la nota no deshace el tratamiento que ya se hizo.
export async function remove(req: Request<{ id: string }>, res: Response) {
  const body = req.body as { reason?: string };
  if (!body.reason?.trim()) {
    return res.status(400).json({ error: 'El motivo de la eliminación es requerido' });
  }

  const evolution = await prisma.evolution.findUnique({ where: { id: req.params.id } });
  if (!evolution) {
    return res.status(404).json({ error: 'Evolución no encontrada' });
  }

  if (!isOwnerOrAdmin(evolution, req)) {
    return res.status(403).json({ error: 'Solo el autor o un administrador pueden eliminar esta evolución' });
  }

  await prisma.evolutionDeletion.create({
    data: {
      evolutionId: evolution.id,
      patientId: evolution.patientId,
      professionalId: evolution.professionalId,
      content: evolution.content,
      reason: body.reason.trim(),
      deletedByUserId: req.user!.sub,
      clinicaId: evolution.clinicaId,
    },
  });
  await prisma.evolution.delete({ where: { id: evolution.id } });
  return res.status(204).send();
}

export async function uploadPhoto(req: Request<{ id: string }>, res: Response) {
  const evolution = await prisma.evolution.findUnique({ where: { id: req.params.id } });
  if (!evolution) {
    return res.status(404).json({ error: 'Evolución no encontrada' });
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
    const uploaded = await uploadImageToCloudinary(file.buffer, `dentalcloud/${evolution.clinicaId}/evolutions/${evolution.id}`);

    await prisma.evolutionPhoto.create({
      data: {
        evolutionId: evolution.id,
        url: uploaded.url,
        publicId: uploaded.publicId,
        label: label || null,
        clinicaId: evolution.clinicaId,
      },
    });

    // Se espeja al ítem del presupuesto (si esta evolución documenta uno) para
    // no romper vistas que todavía leen fotos desde ahí (historial de zonas
    // tratadas en el mapa facial, alertas de sticker faltante en Tratamiento).
    if (evolution.treatmentItemId) {
      await prisma.treatmentItemPhoto.create({
        data: {
          treatmentItemId: evolution.treatmentItemId,
          url: uploaded.url,
          publicId: uploaded.publicId,
          label: label || null,
          clinicaId: evolution.clinicaId,
        },
      });
    }

    const updated = await prisma.evolution.findUniqueOrThrow({ where: { id: evolution.id }, include });
    return res.status(201).json({ evolution: updated });
  } catch (err) {
    console.error('Error subiendo foto a Cloudinary', err);
    return res.status(502).json({ error: 'No se pudo subir la foto. Intenta nuevamente.' });
  }
}

export async function removePhoto(req: Request<{ photoId: string }>, res: Response) {
  const photo = await prisma.evolutionPhoto.findUnique({
    where: { id: req.params.photoId },
    include: { evolution: { select: { treatmentItemId: true } } },
  });
  if (!photo) {
    return res.status(404).json({ error: 'Foto no encontrada' });
  }

  await deleteImageFromCloudinary(photo.publicId);

  await prisma.evolutionPhoto.delete({ where: { id: photo.id } });
  // Elimina también el espejo en el ítem del presupuesto, si lo hay (ver uploadPhoto).
  if (photo.evolution.treatmentItemId) {
    await prisma.treatmentItemPhoto.deleteMany({
      where: { treatmentItemId: photo.evolution.treatmentItemId, publicId: photo.publicId },
    });
  }
  const updated = await prisma.evolution.findUniqueOrThrow({ where: { id: photo.evolutionId }, include });
  return res.json({ evolution: updated });
}
