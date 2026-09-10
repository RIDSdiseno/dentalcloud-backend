import prisma from '../lib/prisma';
import type { InsumoSupply, InsumoSupplyStatus, InsumoClinicalArea } from '@prisma/client';
import { summarizeLots } from './insumoLot.service';

export type InsumoSupplyInput = {
  sucursalId?: string;
  name: string;
  category?: string;
  supplier?: string;
  description?: string;
  purchaseDate?: string;
  quantity?: number;
  unit?: string;
  unitCost?: number;
  totalCost?: number;
  currentStock?: number;
  minimumStock?: number;
  consultingRoom?: string | null;
  clinicalArea?: InsumoClinicalArea;
};

export type InsumoSupplyFilters = {
  search?: string;
  category?: string;
  supplier?: string;
  status?: string;
  clinicalArea?: string;
  dateFrom?: string;
  dateTo?: string;
  sucursalId?: string;
  consultingRoom?: string;
  page?: number;
  limit?: number;
};

// Mismo shape que RemoteInventorySupply (federationClient.ts) para que el
// frontend no necesite distinguir entre el camino federado y el nativo —
// `location` es siempre {id,name}|null, ahora apuntando a una Sucursal real.
export function serializeSupply(
  supply: InsumoSupply & { sucursal: { id: string; name: string } | null }
) {
  return {
    id: supply.id,
    clinicId: supply.clinicaId,
    locationId: supply.sucursalId,
    name: supply.name,
    category: supply.category,
    supplier: supply.supplier,
    consultingRoom: supply.consultingRoom,
    description: supply.description,
    purchaseDate: supply.purchaseDate ? supply.purchaseDate.toISOString() : null,
    quantity: supply.quantity,
    unit: supply.unit,
    unitCost: supply.unitCost,
    totalCost: supply.totalCost,
    currentStock: supply.currentStock,
    minimumStock: supply.minimumStock,
    clinicalArea: supply.clinicalArea,
    status: supply.status,
    archivedAt: supply.archivedAt ? supply.archivedAt.toISOString() : null,
    createdAt: supply.createdAt.toISOString(),
    updatedAt: supply.updatedAt.toISOString(),
    location: supply.sucursal ? { id: supply.sucursal.id, name: supply.sucursal.name } : null,
  };
}

// ARCHIVED es pegajoso; si no, se deriva de currentStock vs minimumStock —
// igual que calculateStatus en clinicSupply.service.js (Dental-Demo-Back).
export function calculateStatus(
  currentStock: number | null | undefined,
  minimumStock: number | null | undefined,
  isArchived: boolean
): InsumoSupplyStatus {
  if (isArchived) return 'ARCHIVED';
  if (currentStock == null) return 'ACTIVE';
  if (currentStock <= 0) return 'OUT_OF_STOCK';
  if (minimumStock != null && currentStock <= minimumStock) return 'LOW_STOCK';
  return 'ACTIVE';
}

function calculateTotalCost(quantity: number | undefined, unitCost: number | undefined): number | undefined {
  if (quantity == null || unitCost == null) return undefined;
  return Math.round(quantity * unitCost);
}

// Mismo criterio que assertEstheticFeatureForCreate/Update en
// clinicSupply.service.js (Dental-Demo-Back): un insumo solo puede marcarse
// Estética/Ambos si la clínica es de tipo "estetica" o "ambas" — acá se usa
// Clinica.tipo en vez de un flag de módulo aparte, mismo criterio que ya
// gatea el resto de las funciones de estética en este repo (ver
// treatmentPlansController.ts).
async function assertClinicalAreaAllowed(clinicaId: string, clinicalArea: InsumoClinicalArea | undefined) {
  if (clinicalArea !== 'ESTHETIC' && clinicalArea !== 'BOTH') return;
  const clinica = await prisma.clinica.findUnique({ where: { id: clinicaId }, select: { tipo: true } });
  if (clinica?.tipo !== 'estetica' && clinica?.tipo !== 'ambas') {
    const error = new Error('Esta clínica no tiene habilitada la gestión de insumos estéticos');
    (error as { statusCode?: number }).statusCode = 403;
    throw error;
  }
}

export async function listInsumoSupplies(clinicaId: string, filters: InsumoSupplyFilters) {
  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const limit = filters.limit && filters.limit > 0 ? Math.min(filters.limit, 200) : 50;

  const where = {
    clinicaId,
    status: filters.status ? (filters.status as InsumoSupplyStatus) : { not: 'ARCHIVED' as InsumoSupplyStatus },
    ...(filters.category ? { category: { equals: filters.category, mode: 'insensitive' as const } } : {}),
    ...(filters.supplier ? { supplier: { equals: filters.supplier, mode: 'insensitive' as const } } : {}),
    ...(filters.sucursalId ? { sucursalId: filters.sucursalId } : {}),
    ...(filters.consultingRoom ? { consultingRoom: filters.consultingRoom } : {}),
    ...(filters.clinicalArea ? { clinicalArea: filters.clinicalArea as InsumoClinicalArea } : {}),
    ...(filters.dateFrom || filters.dateTo
      ? {
          purchaseDate: {
            ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
            ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
          },
        }
      : {}),
    ...(filters.search
      ? {
          OR: [
            { name: { contains: filters.search, mode: 'insensitive' as const } },
            { category: { contains: filters.search, mode: 'insensitive' as const } },
            { supplier: { contains: filters.search, mode: 'insensitive' as const } },
            { description: { contains: filters.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.insumoSupply.findMany({
      where,
      include: { sucursal: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.insumoSupply.count({ where }),
  ]);

  const withLotSummary = await Promise.all(
    items.map(async (item) => ({
      ...serializeSupply(item),
      lotSummary: await summarizeLots(item.id),
    }))
  );

  return { items: withLotSummary, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function getInsumoSupplyById(clinicaId: string, id: string) {
  const supply = await prisma.insumoSupply.findFirst({
    where: { id, clinicaId },
    include: { sucursal: { select: { id: true, name: true } } },
  });
  if (!supply) {
    const error = new Error('Insumo no encontrado');
    (error as { statusCode?: number }).statusCode = 404;
    throw error;
  }
  return { ...serializeSupply(supply), lotSummary: await summarizeLots(supply.id) };
}

async function assertSucursalBelongsToClinica(clinicaId: string, sucursalId: string | undefined) {
  if (!sucursalId) return;
  const sucursal = await prisma.sucursal.findFirst({ where: { id: sucursalId, clinicaId } });
  if (!sucursal) {
    const error = new Error('La sucursal seleccionada no pertenece a esta clínica');
    (error as { statusCode?: number }).statusCode = 400;
    throw error;
  }
}

export async function createInsumoSupply(clinicaId: string, userId: string, input: InsumoSupplyInput) {
  await assertSucursalBelongsToClinica(clinicaId, input.sucursalId);
  await assertClinicalAreaAllowed(clinicaId, input.clinicalArea);
  const totalCost = input.totalCost ?? calculateTotalCost(input.quantity, input.unitCost);
  const status = calculateStatus(input.currentStock, input.minimumStock, false);

  const supply = await prisma.insumoSupply.create({
    data: {
      clinicaId,
      sucursalId: input.sucursalId ?? null,
      createdByUserId: userId,
      name: input.name,
      category: input.category ?? null,
      supplier: input.supplier ?? null,
      consultingRoom: input.consultingRoom ?? null,
      description: input.description ?? null,
      clinicalArea: input.clinicalArea ?? 'DENTAL',
      purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : null,
      quantity: input.quantity ?? null,
      unit: input.unit ?? null,
      unitCost: input.unitCost ?? null,
      totalCost: totalCost ?? null,
      currentStock: input.currentStock ?? null,
      minimumStock: input.minimumStock ?? null,
      status,
    },
    include: { sucursal: { select: { id: true, name: true } } },
  });
  return { ...serializeSupply(supply), lotSummary: await summarizeLots(supply.id) };
}

export async function updateInsumoSupply(
  clinicaId: string,
  userId: string,
  id: string,
  input: Partial<InsumoSupplyInput>
) {
  const existing = await prisma.insumoSupply.findFirst({ where: { id, clinicaId } });
  if (!existing) {
    const error = new Error('Insumo no encontrado');
    (error as { statusCode?: number }).statusCode = 404;
    throw error;
  }
  if (input.sucursalId !== undefined) {
    await assertSucursalBelongsToClinica(clinicaId, input.sucursalId);
  }
  if (input.clinicalArea !== undefined) {
    await assertClinicalAreaAllowed(clinicaId, input.clinicalArea);
  }

  const mergedQuantity = input.quantity ?? existing.quantity ?? undefined;
  const mergedUnitCost = input.unitCost ?? existing.unitCost ?? undefined;
  const totalCost = input.totalCost ?? calculateTotalCost(mergedQuantity ?? undefined, mergedUnitCost ?? undefined) ?? existing.totalCost;
  const mergedCurrentStock = input.currentStock !== undefined ? input.currentStock : existing.currentStock;
  const mergedMinimumStock = input.minimumStock !== undefined ? input.minimumStock : existing.minimumStock;
  const status = calculateStatus(mergedCurrentStock, mergedMinimumStock, existing.status === 'ARCHIVED');

  const supply = await prisma.insumoSupply.update({
    where: { id },
    data: {
      updatedByUserId: userId,
      ...(input.sucursalId !== undefined ? { sucursalId: input.sucursalId || null } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.category !== undefined ? { category: input.category || null } : {}),
      ...(input.supplier !== undefined ? { supplier: input.supplier || null } : {}),
      ...(input.consultingRoom !== undefined ? { consultingRoom: input.consultingRoom } : {}),
      ...(input.description !== undefined ? { description: input.description || null } : {}),
      ...(input.clinicalArea !== undefined ? { clinicalArea: input.clinicalArea } : {}),
      ...(input.purchaseDate !== undefined ? { purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : null } : {}),
      ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
      ...(input.unit !== undefined ? { unit: input.unit || null } : {}),
      ...(input.unitCost !== undefined ? { unitCost: input.unitCost } : {}),
      totalCost: totalCost ?? null,
      ...(input.currentStock !== undefined ? { currentStock: input.currentStock } : {}),
      ...(input.minimumStock !== undefined ? { minimumStock: input.minimumStock } : {}),
      status,
    },
    include: { sucursal: { select: { id: true, name: true } } },
  });
  return { ...serializeSupply(supply), lotSummary: await summarizeLots(supply.id) };
}

export async function archiveInsumoSupply(clinicaId: string, userId: string, id: string) {
  const existing = await prisma.insumoSupply.findFirst({ where: { id, clinicaId } });
  if (!existing) {
    const error = new Error('Insumo no encontrado');
    (error as { statusCode?: number }).statusCode = 404;
    throw error;
  }
  const supply = await prisma.insumoSupply.update({
    where: { id },
    data: { status: 'ARCHIVED', archivedAt: new Date(), updatedByUserId: userId },
    include: { sucursal: { select: { id: true, name: true } } },
  });
  return { ...serializeSupply(supply), lotSummary: await summarizeLots(supply.id) };
}
