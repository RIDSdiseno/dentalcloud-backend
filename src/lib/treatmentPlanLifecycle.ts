import prisma from './prisma';
import { computeTreatmentStatus } from '../utils/treatmentStatus';

export const TREATMENT_PLAN_INCLUDE = {
  professional: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  startedBy: { select: { id: true, name: true } },
  completedBy: { select: { id: true, name: true } },
  sucursal: true,
  prevision: true,
  convenio: true,
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      prestacion: true,
      treatedBy: { select: { id: true, name: true } },
      photos: { orderBy: { createdAt: 'asc' as const } },
    },
  },
  photos: { orderBy: { position: 'asc' as const } },
} as const;

// Estampa trazabilidad de ciclo de vida — quién dio la orden de pasar a
// "en_tratamiento" y quién lo dejó en "terminado" — la primera vez que el
// estado cruza esa transición. Es intencionalmente inmutable: si el estado
// retrocede (ej. se descompleta un ítem) y vuelve a cruzar la misma
// transición, NO se re-estampa; el campo ya estampado queda como registro
// histórico de la primera vez que ocurrió.
function lifecycleStamps(
  plan: { status: string; startedByUserId: string | null; completedByUserId: string | null },
  nextStatus: string,
  actingUserId: string
) {
  const stamps: { startedByUserId?: string; startedAt?: Date; completedByUserId?: string; completedAt?: Date } = {};
  if (nextStatus === 'en_tratamiento' && plan.status !== 'en_tratamiento' && !plan.startedByUserId) {
    stamps.startedByUserId = actingUserId;
    stamps.startedAt = new Date();
  }
  if (nextStatus === 'terminado' && plan.status !== 'terminado' && !plan.completedByUserId) {
    stamps.completedByUserId = actingUserId;
    stamps.completedAt = new Date();
  }
  return stamps;
}

// Recalcula monto/estado del presupuesto a partir de sus ítems (se llama tras
// agregar/editar/eliminar un ítem o una foto) y estampa la trazabilidad de
// ciclo de vida si corresponde. `actingUserId` es quien disparó la acción que
// provocó el recálculo — no necesariamente el profesional asignado al plan.
export async function recalculatePlan(treatmentPlanId: string, actingUserId: string) {
  const plan = await prisma.treatmentPlan.findUniqueOrThrow({ where: { id: treatmentPlanId } });
  const items = await prisma.treatmentItem.findMany({ where: { treatmentPlanId } });
  const amount = items.reduce((sum, i) => sum + i.cost, 0);
  const status = computeTreatmentStatus(items, plan.status);

  return prisma.treatmentPlan.update({
    where: { id: treatmentPlanId },
    data: { amount, status, ...lifecycleStamps(plan, status, actingUserId) },
    include: TREATMENT_PLAN_INCLUDE,
  });
}

// Para el cambio manual de estado (dropdown en TreatmentPlanTab) — mismo
// estampado, pero sobre una transición explícita en vez de recalculada.
export function lifecycleStampsForManualStatusChange(
  plan: { status: string; startedByUserId: string | null; completedByUserId: string | null },
  nextStatus: string,
  actingUserId: string
) {
  return lifecycleStamps(plan, nextStatus, actingUserId);
}

// Un presupuesto "de alta" queda congelado — ninguna acción de edición lo
// puede tocar (ítems, fotos, motivo de modificación, etc.), solo se puede
// ver el detalle. Pedido explícito del usuario, ver TreatmentPlanTab.tsx
// `isAlta`. `computeTreatmentStatus` ya trata "alta" como estado terminal
// (no se revierte solo), así que una vez alcanzado es intencionalmente final.
export function isPlanAlta(plan: { status: string }): boolean {
  return plan.status === 'alta';
}
