import type { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { recalculatePlan, isPlanAlta } from '../lib/treatmentPlanLifecycle';
import { syncTreatmentItemToFederation } from '../lib/federationSync';
import { belongsToRequesterClinica } from '../lib/tenantGuard';
import { getUnsignedProductConsentError } from '../lib/productConsentGuard';
import { sanitizeHtml } from '../lib/sanitizeHtml';
import { discountEvolutionInventory, returnEvolutionInventory } from '../lib/evolutionInventory';
import {
  assertCloudinaryConfigured,
  CloudinaryNotConfiguredError,
  deleteImageFromCloudinary,
  uploadImageToCloudinary,
} from '../lib/cloudinaryUpload';

const include = {
  professional: { select: { id: true, name: true } },
  anuladaPor: { select: { id: true, name: true } },
  treatmentItem: { select: { id: true, description: true, treatmentPlanId: true } },
  photos: { orderBy: { createdAt: 'asc' as const } },
  examRounds: { orderBy: { createdAt: 'asc' as const } },
} as const;

// Avances del Examen Estético que la evolución muestra (tarea 18). Son una
// referencia, no una copia: las fotos siguen viviendo en el Examen Estético.
const EXAM_ROUND_SOURCES = ['facial', 'corporal', 'facialAvanzado', 'video'];
const EXAM_ROUND_MOMENTS = ['antes', 'avance'];

type ExamRoundInput = { source?: string; moment?: string; round?: number };

// Devuelve el error de validación, o null y la lista ya limpia de duplicados
// (el formulario puede mandar el mismo avance dos veces si se marca y
// desmarca rápido; la restricción única de la tabla lo rechazaría).
function parseExamRounds(raw: unknown): { error: string } | { rounds: Required<ExamRoundInput>[] } {
  if (raw === undefined || raw === null) return { rounds: [] };
  if (!Array.isArray(raw)) return { error: 'Los avances enlazados deben venir como lista' };
  const seen = new Set<string>();
  const rounds: Required<ExamRoundInput>[] = [];
  for (const item of raw as ExamRoundInput[]) {
    if (!item || !EXAM_ROUND_SOURCES.includes(item.source ?? '')) {
      return { error: `El registro del avance debe ser uno de: ${EXAM_ROUND_SOURCES.join(', ')}` };
    }
    if (!EXAM_ROUND_MOMENTS.includes(item.moment ?? '')) {
      return { error: `El momento del avance debe ser uno de: ${EXAM_ROUND_MOMENTS.join(', ')}` };
    }
    if (!Number.isInteger(item.round) || (item.round as number) < 1) {
      return { error: 'El número del avance no es válido' };
    }
    const key = `${item.source}|${item.moment}|${item.round}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rounds.push({ source: item.source!, moment: item.moment!, round: item.round! });
  }
  return { rounds };
}

function hasText(html: string) {
  return html.replace(/<[^>]*>/g, '').trim().length > 0;
}

// Solo el autor de la evolución o un admin pueden modificarla/eliminarla.
function isOwnerOrAdmin(evolution: { professionalId: string }, req: Request): boolean {
  return req.user!.role === 'admin' || req.user!.role === 'super_admin' || evolution.professionalId === req.user!.sub;
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
      ...(req.user!.role === 'super_admin' ? {} : { clinicaId: req.user!.clinicaId! }),
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
    productLotId?: string;
    productSupplyId?: string;
    productQuantityUsed?: number;
    productUnitCost?: number;
    examRounds?: ExamRoundInput[];
  };
  if (!body.patientId) {
    return res.status(400).json({ error: 'patientId es requerido' });
  }
  if (!body.content || !hasText(body.content)) {
    return res.status(400).json({ error: 'El contenido de la evolución es requerido' });
  }

  const patient = await prisma.patient.findUnique({ where: { id: body.patientId } });
  if (!patient || !belongsToRequesterClinica(patient, req)) {
    return res.status(400).json({ error: 'El paciente seleccionado no existe' });
  }

  let professionalId = req.user!.sub;
  if (body.professionalId) {
    const professional = await prisma.user.findUnique({ where: { id: body.professionalId } });
    if (!professional || !belongsToRequesterClinica(professional, req)) {
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
    // Etapa 09: evolucionar marca el ítem como realizado (ver más abajo) —
    // si tiene un producto del catálogo, exige la firma del consentimiento
    // de ESE producto antes de dejarlo pasar.
    if (item.productoMarcaId) {
      const blockReason = await getUnsignedProductConsentError(item.treatmentPlan.patientId, item.productoMarcaId);
      if (blockReason) return res.status(409).json({ error: blockReason });
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

  const parsedRounds = parseExamRounds(body.examRounds);
  if ('error' in parsedRounds) {
    return res.status(400).json({ error: parsedRounds.error });
  }

  const productName = body.productName?.trim() || null;
  const productLot = body.productLot?.trim() || null;
  const productExpiresAt = body.productExpiresAt ? new Date(body.productExpiresAt) : null;
  const productQuantity = body.productQuantity?.trim() || null;
  // Sólo se guardan juntos: sin lote real no hay de dónde descontar, y una
  // cantidad suelta no sirve para nada.
  const productLotId = body.productLotId?.trim() || null;
  const productSupplyId = body.productSupplyId?.trim() || null;
  const cantidadUsada = Number(body.productQuantityUsed);
  const productQuantityUsed =
    productLotId && productSupplyId && Number.isFinite(cantidadUsada) && cantidadUsada > 0
      ? cantidadUsada
      : null;

  // Foto del precio al momento de atender. Si mañana sube el costo del lote,
  // lo que costó esta atención no cambia. Valoriza el consumo; NO genera un
  // gasto nuevo (esa plata ya se conto al comprar el insumo).
  const costoUnitario = Number(body.productUnitCost);
  const productUnitCost =
    productQuantityUsed && Number.isFinite(costoUnitario) && costoUnitario > 0 ? Math.round(costoUnitario) : null;
  const productTotalCost = productUnitCost ? Math.round(productUnitCost * productQuantityUsed!) : null;

  const evolution = await prisma.evolution.create({
    data: {
      patientId: body.patientId,
      professionalId,
      content: sanitizeHtml(body.content),
      treatmentItemId: treatmentItem?.id ?? null,
      productName,
      productLot,
      productExpiresAt,
      productQuantity,
      productLotId: productQuantityUsed ? productLotId : null,
      productSupplyId: productQuantityUsed ? productSupplyId : null,
      productQuantityUsed,
      productUnitCost,
      productTotalCost,
      clinicaId: req.user!.clinicaId!,
      examRounds: {
        create: parsedRounds.rounds.map((r) => ({ ...r, clinicaId: req.user!.clinicaId! })),
      },
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

  // Descuenta del inventario lo que se aplicó. No se espera (ni se deja
  // reventar) a propósito: la evolución ya está grabada y es lo que importa;
  // si el inventario no responde, queda el fallo en el log y el stock sin
  // mover — ver evolutionInventory.ts.
  discountEvolutionInventory(evolution).catch(() => {});

  return res.status(201).json({ evolution });
}

export async function update(req: Request<{ id: string }>, res: Response) {
  const body = req.body as { content?: string; enabled?: boolean; examRounds?: ExamRoundInput[] };
  const evolution = await prisma.evolution.findUnique({ where: { id: req.params.id } });
  if (!evolution || !belongsToRequesterClinica(evolution, req)) {
    return res.status(404).json({ error: 'Evolución no encontrada' });
  }

  if (!isOwnerOrAdmin(evolution, req)) {
    return res.status(403).json({ error: 'Solo el autor o un administrador pueden modificar esta evolución' });
  }

  // Una evolución anulada queda congelada: el registro que se anuló tiene que
  // seguir siendo el mismo que se leyó al anularlo, si no la anulación no vale
  // como respaldo de nada.
  if (evolution.anuladaAt) {
    return res.status(409).json({ error: 'Esta evolución está anulada y ya no se puede modificar' });
  }

  if (body.content !== undefined && !hasText(body.content)) {
    return res.status(400).json({ error: 'El contenido de la evolución es requerido' });
  }

  // Los avances se reemplazan por completo: el formulario manda la selección
  // final, no un diff.
  let roundsData: Required<ExamRoundInput>[] | null = null;
  if (body.examRounds !== undefined) {
    const parsed = parseExamRounds(body.examRounds);
    if ('error' in parsed) return res.status(400).json({ error: parsed.error });
    roundsData = parsed.rounds;
  }

  const updated = await prisma.evolution.update({
    where: { id: req.params.id },
    data: {
      ...(body.content !== undefined ? { content: sanitizeHtml(body.content) } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      ...(roundsData
        ? {
            examRounds: {
              deleteMany: {},
              create: roundsData.map((r) => ({ ...r, clinicaId: evolution.clinicaId })),
            },
          }
        : {}),
    },
    include,
  });
  return res.json({ evolution: updated });
}

// Anular una evolución. NO se borra: una evolución es registro clínico y en
// Chile no se puede eliminar — hacerlo sería fraude (planteado por el cliente
// en la reunión del 30/09). Queda visible en la ficha, tachada, con quién la
// anuló, cuándo y por qué.
//
// Antes esto borraba de verdad y dejaba copia en `EvolutionDeletion`. Esa
// tabla no se muestra en ninguna pantalla, así que la evolución desaparecía
// igual del historial del paciente: justo lo que el respaldo busca impedir.
// La tabla se conserva (guarda los borrados antiguos) pero ya no se escribe.
//
// No revierte nada que ya se haya sincronizado al TreatmentItem
// (completed/producto/fotos) cuando la evolución documentaba un procedimiento
// — anular la nota no deshace el tratamiento que ya se hizo.
export async function remove(req: Request<{ id: string }>, res: Response) {
  const body = req.body as { reason?: string };
  if (!body.reason?.trim()) {
    return res.status(400).json({ error: 'El motivo de la anulación es requerido' });
  }

  const evolution = await prisma.evolution.findUnique({ where: { id: req.params.id } });
  if (!evolution || !belongsToRequesterClinica(evolution, req)) {
    return res.status(404).json({ error: 'Evolución no encontrada' });
  }

  if (!isOwnerOrAdmin(evolution, req)) {
    return res.status(403).json({ error: 'Solo el autor o un administrador pueden anular esta evolución' });
  }

  if (evolution.anuladaAt) {
    return res.status(409).json({ error: 'Esta evolución ya está anulada' });
  }

  const updated = await prisma.evolution.update({
    where: { id: evolution.id },
    data: {
      anuladaAt: new Date(),
      anuladaPorId: req.user!.sub,
      anulacionMotivo: body.reason.trim(),
    },
    include,
  });

  // Si esta evolución había descontado stock, el producto vuelve: se anuló
  // porque no debió existir, y ese consumo tampoco.
  returnEvolutionInventory(updated).catch(() => {});

  return res.json({ evolution: updated });
}

export async function uploadPhoto(req: Request<{ id: string }>, res: Response) {
  const evolution = await prisma.evolution.findUnique({ where: { id: req.params.id } });
  if (!evolution || !belongsToRequesterClinica(evolution, req)) {
    return res.status(404).json({ error: 'Evolución no encontrada' });
  }
  if (evolution.anuladaAt) {
    return res.status(409).json({ error: 'Esta evolución está anulada: no admite fotos nuevas' });
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
    include: { evolution: { select: { treatmentItemId: true, anuladaAt: true } } },
  });
  if (!photo || !belongsToRequesterClinica(photo, req)) {
    return res.status(404).json({ error: 'Foto no encontrada' });
  }
  // Las fotos de una evolución anulada son parte del registro que se anuló:
  // se quedan, igual que el texto.
  if (photo.evolution.anuladaAt) {
    return res.status(409).json({ error: 'Esta evolución está anulada: sus fotos ya no se pueden eliminar' });
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
