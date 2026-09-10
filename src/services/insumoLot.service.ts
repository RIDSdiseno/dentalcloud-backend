import prisma from '../lib/prisma';
import { Prisma } from '@prisma/client';
import type { InsumoLot, InsumoMovementType } from '@prisma/client';
import { calculateStatus, serializeSupply } from './insumoSupply.service';

type Tx = Prisma.TransactionClient;

export type InsumoLotInput = {
  lotNumber: string;
  manufacturer?: string | null;
  presentation?: string | null;
  concentration?: string | null;
  healthRegistration?: string | null;
  receivedAt?: string;
  expirationDate?: string | null;
  initialQuantity?: number;
  quantity?: number;
  isActive?: boolean;
};

export type InsumoLotFilters = {
  sucursalId?: string;
  search?: string;
  expirationStatus?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  active?: boolean;
  page?: number;
  limit?: number;
};

export type InsumoAlertsFilters = {
  sucursalId?: string;
  includeItems?: boolean;
  expirationStatus?: string;
  active?: boolean;
  page?: number;
  limit?: number;
};

const EXPIRING_SOON_DAYS = 30;

function startOfLocalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

type ExpirationStatus = 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'NO_EXPIRATION';

function getExpirationStatus(expiresAt: Date | null): { status: ExpirationStatus; daysUntilExpiration: number | null } {
  if (!expiresAt) return { status: 'NO_EXPIRATION', daysUntilExpiration: null };
  const today = startOfLocalDay(new Date());
  const expiry = startOfLocalDay(expiresAt);
  const days = Math.round((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) return { status: 'EXPIRED', daysUntilExpiration: days };
  if (days <= EXPIRING_SOON_DAYS) return { status: 'EXPIRING', daysUntilExpiration: days };
  return { status: 'ACTIVE', daysUntilExpiration: days };
}

const EXPIRATION_STATUS_LABELS: Record<ExpirationStatus, string> = {
  ACTIVE: 'Vigente',
  EXPIRING: 'Por vencer',
  EXPIRED: 'Vencido',
  NO_EXPIRATION: 'Sin vencimiento',
};

export function serializeLot(lot: InsumoLot & { sucursal: { id: string; name: string } | null }) {
  const { status, daysUntilExpiration } = getExpirationStatus(lot.expiresAt);
  return {
    id: lot.id,
    supplyId: lot.supplyId,
    locationId: lot.sucursalId,
    lotNumber: lot.lotNumber,
    manufacturer: lot.manufacturer,
    presentation: lot.presentation,
    concentration: lot.concentration,
    healthRegistration: lot.healthRegistration,
    quantity: lot.currentQuantity,
    initialQuantity: lot.initialQuantity,
    currentQuantity: lot.currentQuantity,
    expirationDate: lot.expiresAt ? lot.expiresAt.toISOString() : null,
    receivedAt: lot.receivedAt ? lot.receivedAt.toISOString() : null,
    expirationStatus: status,
    expirationStatusLabel: EXPIRATION_STATUS_LABELS[status],
    daysUntilExpiration,
    isActive: lot.isActive,
    location: lot.sucursal ? { id: lot.sucursal.id, name: lot.sucursal.name } : null,
  };
}

// Recalcula currentStock/status del insumo como la suma de los lotes activos
// — se llama siempre dentro de la misma transacción que crea/edita un lote o
// registra un movimiento (mismo invariante que syncSupplyStockFromLots en
// clinicSupplyLot.service.js, Dental-Demo-Back).
async function syncSupplyStockFromLots(tx: Tx, supplyId: string) {
  const agg = await tx.insumoLot.aggregate({
    where: { supplyId, isActive: true },
    _sum: { currentQuantity: true },
  });
  const currentStock = agg._sum.currentQuantity ?? 0;
  const supply = await tx.insumoSupply.findUniqueOrThrow({ where: { id: supplyId } });
  const status = calculateStatus(currentStock, supply.minimumStock, supply.status === 'ARCHIVED');
  await tx.insumoSupply.update({ where: { id: supplyId }, data: { currentStock, status } });
}

export async function summarizeLots(supplyId: string) {
  const lots = await prisma.insumoLot.findMany({ where: { supplyId, isActive: true } });
  if (lots.length === 0) {
    return { totalLots: 0, activeLots: 0, totalQuantity: 0, expiredLots: 0, expiringLots: 0, nextExpirationDate: null as string | null };
  }
  let expiredLots = 0;
  let expiringLots = 0;
  let totalQuantity = 0;
  let nextExpirationDate: Date | null = null;
  for (const lot of lots) {
    totalQuantity += lot.currentQuantity;
    const { status } = getExpirationStatus(lot.expiresAt);
    if (status === 'EXPIRED') expiredLots += 1;
    if (status === 'EXPIRING') expiringLots += 1;
    if (lot.expiresAt && (!nextExpirationDate || lot.expiresAt < nextExpirationDate)) {
      nextExpirationDate = lot.expiresAt;
    }
  }
  return {
    totalLots: lots.length,
    activeLots: lots.length,
    totalQuantity,
    expiredLots,
    expiringLots,
    nextExpirationDate: nextExpirationDate ? (nextExpirationDate as Date).toISOString() : null,
  };
}

async function getSupplyForClinica(clinicaId: string, supplyId: string) {
  const supply = await prisma.insumoSupply.findFirst({ where: { id: supplyId, clinicaId } });
  if (!supply) {
    const error = new Error('Insumo no encontrado');
    (error as { statusCode?: number }).statusCode = 404;
    throw error;
  }
  return supply;
}

function normalizeLotNumber(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export async function listInsumoLots(clinicaId: string, supplyId: string, filters: InsumoLotFilters) {
  await getSupplyForClinica(clinicaId, supplyId);
  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const limit = filters.limit && filters.limit > 0 ? Math.min(filters.limit, 200) : 100;

  const where = {
    supplyId,
    ...(filters.sucursalId ? { sucursalId: filters.sucursalId } : {}),
    ...(filters.active !== undefined ? { isActive: filters.active } : {}),
    ...(filters.search ? { lotNumber: { contains: filters.search, mode: 'insensitive' as const } } : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.insumoLot.findMany({
      where,
      include: { sucursal: { select: { id: true, name: true } } },
      orderBy: { expiresAt: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.insumoLot.count({ where }),
  ]);

  return { items: items.map(serializeLot), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function createInsumoLot(clinicaId: string, userId: string, supplyId: string, input: InsumoLotInput) {
  const supply = await getSupplyForClinica(clinicaId, supplyId);
  if (supply.status === 'ARCHIVED') {
    const error = new Error('No se pueden agregar lotes a un insumo archivado');
    (error as { statusCode?: number }).statusCode = 400;
    throw error;
  }
  if (!input.lotNumber?.trim()) {
    const error = new Error('El número de lote es requerido');
    (error as { statusCode?: number }).statusCode = 400;
    throw error;
  }
  const lotNumber = normalizeLotNumber(input.lotNumber);
  const initialQuantity = input.initialQuantity ?? input.quantity ?? 0;

  const lot = await prisma.$transaction(async (tx) => {
    const existing = await tx.insumoLot.findFirst({
      where: { supplyId, lotNumber: { equals: lotNumber, mode: 'insensitive' } },
    });
    if (existing) {
      const error = new Error('Ya existe un lote con ese número para este insumo');
      (error as { statusCode?: number }).statusCode = 400;
      throw error;
    }

    const created = await tx.insumoLot.create({
      data: {
        clinicaId,
        supplyId,
        sucursalId: supply.sucursalId,
        createdByUserId: userId,
        lotNumber,
        manufacturer: input.manufacturer ?? null,
        presentation: input.presentation ?? null,
        concentration: input.concentration ?? null,
        healthRegistration: input.healthRegistration ?? null,
        receivedAt: input.receivedAt ? new Date(input.receivedAt) : null,
        expiresAt: input.expirationDate ? new Date(input.expirationDate) : null,
        initialQuantity,
        currentQuantity: initialQuantity,
        isActive: input.isActive ?? true,
      },
      include: { sucursal: { select: { id: true, name: true } } },
    });

    await tx.insumoLotMovement.create({
      data: {
        clinicaId,
        supplyId,
        lotId: created.id,
        sucursalId: supply.sucursalId,
        createdByUserId: userId,
        movementType: 'IN',
        quantity: initialQuantity,
        previousQuantity: 0,
        resultingQuantity: initialQuantity,
        reason: 'Ingreso inicial de lote',
      },
    });

    await syncSupplyStockFromLots(tx, supplyId);
    return created;
  });

  return serializeLot(lot);
}

async function getLotForSupply(tx: Tx, supplyId: string, lotId: string) {
  const lot = await tx.insumoLot.findFirst({ where: { id: lotId, supplyId } });
  if (!lot) {
    const error = new Error('Lote no encontrado');
    (error as { statusCode?: number }).statusCode = 404;
    throw error;
  }
  return lot;
}

export async function updateInsumoLot(
  clinicaId: string,
  userId: string,
  supplyId: string,
  lotId: string,
  input: Partial<InsumoLotInput>
) {
  await getSupplyForClinica(clinicaId, supplyId);

  const lot = await prisma.$transaction(async (tx) => {
    const existing = await getLotForSupply(tx, supplyId, lotId);

    if (input.lotNumber !== undefined) {
      const lotNumber = normalizeLotNumber(input.lotNumber);
      const duplicate = await tx.insumoLot.findFirst({
        where: { supplyId, lotNumber: { equals: lotNumber, mode: 'insensitive' }, id: { not: lotId } },
      });
      if (duplicate) {
        const error = new Error('Ya existe un lote con ese número para este insumo');
        (error as { statusCode?: number }).statusCode = 400;
        throw error;
      }
    }

    const updated = await tx.insumoLot.update({
      where: { id: lotId },
      data: {
        updatedByUserId: userId,
        ...(input.lotNumber !== undefined ? { lotNumber: normalizeLotNumber(input.lotNumber) } : {}),
        ...(input.manufacturer !== undefined ? { manufacturer: input.manufacturer } : {}),
        ...(input.presentation !== undefined ? { presentation: input.presentation } : {}),
        ...(input.concentration !== undefined ? { concentration: input.concentration } : {}),
        ...(input.healthRegistration !== undefined ? { healthRegistration: input.healthRegistration } : {}),
        ...(input.receivedAt !== undefined ? { receivedAt: input.receivedAt ? new Date(input.receivedAt) : null } : {}),
        ...(input.expirationDate !== undefined ? { expiresAt: input.expirationDate ? new Date(input.expirationDate) : null } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        // Igual que updateClinicSupplyLot en Dental-Demo-Back: editar la
        // cantidad acá sobreescribe currentQuantity directo, sin pasar por el
        // ledger de movimientos (a diferencia del endpoint de movimientos).
        ...(input.quantity !== undefined ? { currentQuantity: input.quantity } : {}),
      },
      include: { sucursal: { select: { id: true, name: true } } },
    });

    await syncSupplyStockFromLots(tx, supplyId);
    void existing;
    return updated;
  });

  return serializeLot(lot);
}

function buildResultingQuantity(movementType: InsumoMovementType, currentQuantity: number, quantity: number): number {
  if (movementType === 'IN') return currentQuantity + quantity;
  if (movementType === 'OUT') return currentQuantity - quantity;
  return quantity; // ADJUSTMENT reemplaza el valor absoluto
}

export async function createInsumoLotMovement(
  clinicaId: string,
  userId: string,
  supplyId: string,
  lotId: string,
  input: { movementType: InsumoMovementType; quantity: number; reason?: string | null }
) {
  await getSupplyForClinica(clinicaId, supplyId);

  if (input.movementType === 'ADJUSTMENT' && !input.reason?.trim()) {
    const error = new Error('El motivo es requerido para un ajuste');
    (error as { statusCode?: number }).statusCode = 400;
    throw error;
  }

  const result = await prisma.$transaction(async (tx) => {
    const lot = await getLotForSupply(tx, supplyId, lotId);
    if (!lot.isActive) {
      const error = new Error('No se pueden registrar movimientos en un lote inactivo');
      (error as { statusCode?: number }).statusCode = 400;
      throw error;
    }
    const { status: expirationStatus } = getExpirationStatus(lot.expiresAt);
    if (input.movementType === 'OUT' && expirationStatus === 'EXPIRED') {
      const error = new Error('No se puede registrar una salida de un lote vencido');
      (error as { statusCode?: number }).statusCode = 400;
      throw error;
    }

    const resultingQuantity = buildResultingQuantity(input.movementType, lot.currentQuantity, input.quantity);
    if (resultingQuantity < 0) {
      const error = new Error('El movimiento excede el stock disponible del lote');
      (error as { statusCode?: number }).statusCode = 400;
      throw error;
    }

    const movement = await tx.insumoLotMovement.create({
      data: {
        clinicaId,
        supplyId,
        lotId,
        sucursalId: lot.sucursalId,
        createdByUserId: userId,
        movementType: input.movementType,
        quantity: input.quantity,
        previousQuantity: lot.currentQuantity,
        resultingQuantity,
        reason: input.reason ?? null,
      },
    });

    const updatedLot = await tx.insumoLot.update({
      where: { id: lotId },
      data: { currentQuantity: resultingQuantity },
      include: { sucursal: { select: { id: true, name: true } } },
    });

    await syncSupplyStockFromLots(tx, supplyId);
    const updatedSupply = await tx.insumoSupply.findUniqueOrThrow({
      where: { id: supplyId },
      include: { sucursal: { select: { id: true, name: true } } },
    });

    return { movement, lot: updatedLot, supply: updatedSupply };
  });

  return {
    movement: {
      id: result.movement.id,
      movementType: result.movement.movementType,
      quantity: result.movement.quantity,
      previousQuantity: result.movement.previousQuantity,
      resultingQuantity: result.movement.resultingQuantity,
      reason: result.movement.reason,
      createdAt: result.movement.createdAt.toISOString(),
    },
    lot: serializeLot(result.lot),
    supply: { ...serializeSupply(result.supply), lotSummary: await summarizeLots(supplyId) },
  };
}

export async function getInsumoAlerts(clinicaId: string, filters: InsumoAlertsFilters) {
  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const limit = filters.limit && filters.limit > 0 ? Math.min(filters.limit, 200) : 50;
  const includeItems = filters.includeItems !== false;

  const today = startOfLocalDay(new Date());
  const expiringLimit = new Date(today);
  expiringLimit.setDate(expiringLimit.getDate() + EXPIRING_SOON_DAYS);

  const lotWhere = {
    clinicaId,
    isActive: true,
    ...(filters.sucursalId ? { sucursalId: filters.sucursalId } : {}),
  };

  const [expiredLots, expiringLots, suppliesWithoutStock, lowStockSupplies] = await Promise.all([
    prisma.insumoLot.count({ where: { ...lotWhere, expiresAt: { lt: today } } }),
    prisma.insumoLot.count({ where: { ...lotWhere, expiresAt: { gte: today, lte: expiringLimit } } }),
    prisma.insumoSupply.count({
      where: { clinicaId, status: { not: 'ARCHIVED' }, OR: [{ currentStock: null }, { currentStock: { lte: 0 } }] },
    }),
    prisma.insumoSupply.count({ where: { clinicaId, status: 'LOW_STOCK' } }),
  ]);

  let items: ReturnType<typeof serializeLot>[] = [];
  let total = 0;
  if (includeItems) {
    let where = lotWhere as Record<string, unknown>;
    if (filters.expirationStatus === 'EXPIRED') where = { ...where, expiresAt: { lt: today } };
    else if (filters.expirationStatus === 'EXPIRING') where = { ...where, expiresAt: { gte: today, lte: expiringLimit } };
    else if (filters.expirationStatus === 'NO_EXPIRATION') where = { ...where, expiresAt: null };

    const [rows, count] = await prisma.$transaction([
      prisma.insumoLot.findMany({
        where,
        include: { sucursal: { select: { id: true, name: true } } },
        orderBy: [{ expiresAt: 'asc' }, { currentQuantity: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.insumoLot.count({ where }),
    ]);
    items = rows.map(serializeLot);
    total = count;
  }

  return {
    expiredLots,
    expiringLots,
    suppliesWithoutStock,
    lowStockSupplies,
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
