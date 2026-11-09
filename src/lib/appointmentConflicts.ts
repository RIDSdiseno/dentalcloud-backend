import type { Prisma } from '@prisma/client';

// Choques de agenda (09-11-2026): un sillón no puede tener dos citas a la vez,
// ni una cita encima de una hora publicada para el portal (que un paciente
// podría tomar en ese mismo momento). Devuelve el motivo del choque o null.
// `exceptOpenSlotId` = la hora publicada que se está tomando.
// Llamar dentro de una transacción después de lockChair, para que dos
// reservas simultáneas no pasen las dos el chequeo.
export async function lockChair(tx: Prisma.TransactionClient, chairId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'chair:' + chairId}))`;
}

export async function findChairConflict(
  tx: Prisma.TransactionClient,
  chairId: string,
  startAt: Date,
  endAt: Date,
  exceptOpenSlotId?: string
): Promise<string | null> {
  const [cita, publicada] = await Promise.all([
    tx.appointment.findFirst({
      where: { chairId, status: { not: 'cancelada' }, startAt: { lt: endAt }, endAt: { gt: startAt } },
      select: { id: true },
    }),
    tx.openSlot.findFirst({
      where: {
        chairId,
        status: 'abierta',
        startAt: { lt: endAt },
        endAt: { gt: startAt },
        ...(exceptOpenSlotId ? { id: { not: exceptOpenSlotId } } : {}),
      },
      select: { id: true },
    }),
  ]);
  if (cita) return 'Ese sillón ya tiene una cita en ese horario';
  if (publicada) {
    return 'Ese horario está publicado como hora disponible para los pacientes. Tómalo desde "Seleccionar cita ya postulada" o quita la hora publicada.';
  }
  return null;
}
