import type { Request, Response } from 'express';
import { isAxiosError } from 'axios';
import {
  isFederationConfigured,
  fetchRemoteInventorySupplies,
  fetchRemoteInventorySupply,
  createRemoteInventorySupply,
  updateRemoteInventorySupply,
  archiveRemoteInventorySupply,
  fetchRemoteInventoryLots,
  createRemoteInventoryLot,
  updateRemoteInventoryLot,
  createRemoteInventoryLotMovement,
  fetchRemoteInventoryAlerts,
  type InventorySupplyFilters,
  type InventorySupplyInput,
  type InventoryLotFilters,
  type InventoryLotInput,
  type InventoryLotMovementInput,
  type InventoryAlertsFilters,
} from '../lib/federationClient';

// A diferencia de searchProductLots (autocompletado "nice to have" que
// degrada en silencio si la federación falla), esta página depende por
// completo del inventario de Dental-Demo-Back — cualquier fallo real debe
// verse en el front, nunca fingir éxito ni devolver una lista vacía sin avisar.
function relayFederationError(res: Response, error: unknown, fallbackMessage: string) {
  if (isAxiosError(error) && error.response) {
    const data = error.response.data as { message?: string; error?: string } | undefined;
    const message = data?.message ?? data?.error ?? fallbackMessage;
    return res.status(error.response.status).json({ error: message });
  }
  console.error(fallbackMessage, error);
  return res.status(502).json({ error: fallbackMessage });
}

function assertFederationConfigured(res: Response): boolean {
  if (!isFederationConfigured()) {
    res.status(503).json({ error: 'La federación con Dental-Demo-Back no está configurada.' });
    return false;
  }
  return true;
}

function pickSupplyInput(body: Record<string, unknown>): InventorySupplyInput {
  return {
    sucursalId: typeof body.sucursalId === 'string' ? body.sucursalId : undefined,
    name: String(body.name ?? ''),
    category: typeof body.category === 'string' ? body.category : undefined,
    supplier: typeof body.supplier === 'string' ? body.supplier : undefined,
    description: typeof body.description === 'string' ? body.description : undefined,
    purchaseDate: typeof body.purchaseDate === 'string' ? body.purchaseDate : undefined,
    quantity: typeof body.quantity === 'number' ? body.quantity : undefined,
    unit: typeof body.unit === 'string' ? body.unit : undefined,
    unitCost: typeof body.unitCost === 'number' ? Math.round(body.unitCost) : undefined,
    totalCost: typeof body.totalCost === 'number' ? Math.round(body.totalCost) : undefined,
    currentStock: typeof body.currentStock === 'number' ? body.currentStock : undefined,
    minimumStock: typeof body.minimumStock === 'number' ? body.minimumStock : undefined,
    consultingRoom: body.consultingRoom === null ? null : typeof body.consultingRoom === 'string' ? body.consultingRoom : undefined,
  };
}

function pickLotInput(body: Record<string, unknown>): InventoryLotInput {
  return {
    lotNumber: String(body.lotNumber ?? ''),
    manufacturer: body.manufacturer === null ? null : typeof body.manufacturer === 'string' ? body.manufacturer : undefined,
    presentation: body.presentation === null ? null : typeof body.presentation === 'string' ? body.presentation : undefined,
    concentration: body.concentration === null ? null : typeof body.concentration === 'string' ? body.concentration : undefined,
    healthRegistration:
      body.healthRegistration === null ? null : typeof body.healthRegistration === 'string' ? body.healthRegistration : undefined,
    receivedAt: typeof body.receivedAt === 'string' ? body.receivedAt : undefined,
    expirationDate: body.expirationDate === null ? null : typeof body.expirationDate === 'string' ? body.expirationDate : undefined,
    initialQuantity: typeof body.initialQuantity === 'number' ? body.initialQuantity : undefined,
    quantity: typeof body.quantity === 'number' ? body.quantity : undefined,
    isActive: typeof body.isActive === 'boolean' ? body.isActive : undefined,
  };
}

export async function listInventorySupplies(req: Request, res: Response) {
  if (!assertFederationConfigured(res)) return;
  const clinicaId = req.user!.clinicaId!;
  const filters = req.query as InventorySupplyFilters;
  try {
    const data = await fetchRemoteInventorySupplies(clinicaId, filters);
    return res.json(data);
  } catch (error) {
    return relayFederationError(res, error, 'No se pudo cargar el inventario de Dental-Demo-Back');
  }
}

export async function getInventorySupply(req: Request<{ id: string }>, res: Response) {
  if (!assertFederationConfigured(res)) return;
  const clinicaId = req.user!.clinicaId!;
  try {
    const data = await fetchRemoteInventorySupply(clinicaId, req.params.id);
    return res.json(data);
  } catch (error) {
    return relayFederationError(res, error, 'No se pudo cargar el insumo');
  }
}

export async function createInventorySupply(req: Request, res: Response) {
  if (!assertFederationConfigured(res)) return;
  const clinicaId = req.user!.clinicaId!;
  try {
    const data = await createRemoteInventorySupply(clinicaId, pickSupplyInput(req.body ?? {}));
    return res.status(201).json(data);
  } catch (error) {
    return relayFederationError(res, error, 'No se pudo crear el insumo');
  }
}

export async function updateInventorySupply(req: Request<{ id: string }>, res: Response) {
  if (!assertFederationConfigured(res)) return;
  const clinicaId = req.user!.clinicaId!;
  try {
    const data = await updateRemoteInventorySupply(clinicaId, req.params.id, pickSupplyInput(req.body ?? {}));
    return res.json(data);
  } catch (error) {
    return relayFederationError(res, error, 'No se pudo actualizar el insumo');
  }
}

export async function archiveInventorySupply(req: Request<{ id: string }>, res: Response) {
  if (!assertFederationConfigured(res)) return;
  const clinicaId = req.user!.clinicaId!;
  try {
    const data = await archiveRemoteInventorySupply(clinicaId, req.params.id);
    return res.json(data);
  } catch (error) {
    return relayFederationError(res, error, 'No se pudo archivar el insumo');
  }
}

export async function listInventoryLots(req: Request<{ id: string }>, res: Response) {
  if (!assertFederationConfigured(res)) return;
  const clinicaId = req.user!.clinicaId!;
  const filters = req.query as InventoryLotFilters;
  try {
    const data = await fetchRemoteInventoryLots(clinicaId, req.params.id, filters);
    return res.json(data);
  } catch (error) {
    return relayFederationError(res, error, 'No se pudieron cargar los lotes');
  }
}

export async function createInventoryLot(req: Request<{ id: string }>, res: Response) {
  if (!assertFederationConfigured(res)) return;
  const clinicaId = req.user!.clinicaId!;
  try {
    const data = await createRemoteInventoryLot(clinicaId, req.params.id, pickLotInput(req.body ?? {}));
    return res.status(201).json(data);
  } catch (error) {
    return relayFederationError(res, error, 'No se pudo crear el lote');
  }
}

export async function updateInventoryLot(req: Request<{ id: string; lotId: string }>, res: Response) {
  if (!assertFederationConfigured(res)) return;
  const clinicaId = req.user!.clinicaId!;
  try {
    const data = await updateRemoteInventoryLot(clinicaId, req.params.id, req.params.lotId, pickLotInput(req.body ?? {}));
    return res.json(data);
  } catch (error) {
    return relayFederationError(res, error, 'No se pudo actualizar el lote');
  }
}

export async function createInventoryLotMovement(req: Request<{ id: string; lotId: string }>, res: Response) {
  if (!assertFederationConfigured(res)) return;
  const clinicaId = req.user!.clinicaId!;
  const body = req.body as Partial<InventoryLotMovementInput>;
  if (!body.movementType || typeof body.quantity !== 'number') {
    return res.status(400).json({ error: 'movementType y quantity son requeridos' });
  }
  try {
    const data = await createRemoteInventoryLotMovement(clinicaId, req.params.id, req.params.lotId, {
      movementType: body.movementType,
      quantity: body.quantity,
      reason: typeof body.reason === 'string' ? body.reason : undefined,
    });
    return res.status(201).json(data);
  } catch (error) {
    return relayFederationError(res, error, 'No se pudo registrar el movimiento');
  }
}

export async function getInventoryAlerts(req: Request, res: Response) {
  if (!assertFederationConfigured(res)) return;
  const clinicaId = req.user!.clinicaId!;
  const filters = req.query as InventoryAlertsFilters;
  try {
    const data = await fetchRemoteInventoryAlerts(clinicaId, filters);
    return res.json(data);
  } catch (error) {
    return relayFederationError(res, error, 'No se pudieron cargar las alertas de inventario');
  }
}
