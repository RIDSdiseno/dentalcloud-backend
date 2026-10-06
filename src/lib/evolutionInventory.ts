import prisma from './prisma';
import { createRemoteInventoryLotMovement } from './federationClient';
import { isClinicaFederatedForInventory } from './federationEligibility';

// Descuenta del inventario real de Gestión lo que se aplicó al paciente.
//
// Dos reglas que no se negocian:
//
// 1. Esto NUNCA puede impedir que se grabe una evolución. Una evolución es
//    registro clínico; que el inventario de otro sistema no responda no puede
//    dejar al profesional sin poder documentar lo que hizo. Por eso todo acá
//    es "mejor esfuerzo": si falla, se registra el fallo y la evolución queda
//    igual, sólo que sin descontar.
//
// 2. Sólo se descuenta si se eligió un lote real del buscador. Si el lote se
//    escribió a mano (porque el inventario estaba caído) no hay de dónde
//    restar, y adivinar el lote sería peor que no hacer nada.

type EvolucionConProducto = {
  id: string;
  clinicaId: string;
  productLotId: string | null;
  productSupplyId: string | null;
  productQuantityUsed: number | null;
  inventoryDiscountedAt: Date | null;
  productName: string | null;
};

function puedeDescontar(evolution: EvolucionConProducto) {
  return Boolean(
    evolution.productLotId && evolution.productSupplyId && (evolution.productQuantityUsed ?? 0) > 0
  );
}

async function registrarFallo(evolutionId: string, error: unknown) {
  const mensaje = error instanceof Error ? error.message : String(error);
  // No se usa FederationSyncFailure porque esto no es un espejo de datos sino
  // un movimiento de stock: se deja en el log para que quede rastro y se sigue.
  console.error(`[inventario] no se pudo mover el stock de la evolución ${evolutionId}: ${mensaje}`);
}

export async function discountEvolutionInventory(evolution: EvolucionConProducto) {
  if (!puedeDescontar(evolution) || evolution.inventoryDiscountedAt) return;
  if (!(await isClinicaFederatedForInventory(evolution.clinicaId))) return;

  try {
    await createRemoteInventoryLotMovement(
      evolution.clinicaId,
      evolution.productSupplyId!,
      evolution.productLotId!,
      {
        movementType: 'OUT',
        quantity: evolution.productQuantityUsed!,
        reason: `Aplicado al paciente (evolución ${evolution.id.slice(0, 8)})`,
      }
    );
    await prisma.evolution.update({
      where: { id: evolution.id },
      data: { inventoryDiscountedAt: new Date() },
    });
  } catch (error) {
    await registrarFallo(evolution.id, error);
  }
}

// Al anular una evolución el producto vuelve al inventario: si la evolución se
// anuló es porque no debió existir, y el stock descontado tampoco. Se repone
// con un movimiento de entrada en vez de borrar el de salida, para que el
// historial de inventario muestre las dos cosas que pasaron de verdad.
export async function returnEvolutionInventory(evolution: EvolucionConProducto) {
  if (!evolution.inventoryDiscountedAt || !puedeDescontar(evolution)) return;
  if (!(await isClinicaFederatedForInventory(evolution.clinicaId))) return;

  try {
    await createRemoteInventoryLotMovement(
      evolution.clinicaId,
      evolution.productSupplyId!,
      evolution.productLotId!,
      {
        movementType: 'IN',
        quantity: evolution.productQuantityUsed!,
        reason: `Devuelto por anulación de la evolución ${evolution.id.slice(0, 8)}`,
      }
    );
    await prisma.evolution.update({
      where: { id: evolution.id },
      data: { inventoryDiscountedAt: null },
    });
  } catch (error) {
    await registrarFallo(evolution.id, error);
  }
}
