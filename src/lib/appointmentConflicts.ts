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

// Profesional en dos sillones a la vez (13-11-2026): un mismo profesional no
// puede tener dos citas que se crucen. Mismo esquema que el sillón: candado
// por profesional dentro de la transacción y después el chequeo.
export async function lockProfessional(tx: Prisma.TransactionClient, professionalId: string | null | undefined) {
  if (!professionalId) return;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'prof:' + professionalId}))`;
}

export async function findProfessionalConflict(
  tx: Prisma.TransactionClient,
  professionalId: string | null | undefined,
  startAt: Date,
  endAt: Date,
  exceptAppointmentId?: string
): Promise<string | null> {
  if (!professionalId) return null;
  const cita = await tx.appointment.findFirst({
    where: {
      professionalId,
      status: { notIn: ['cancelada', 'no_asistio'] },
      startAt: { lt: endAt },
      endAt: { gt: startAt },
      ...(exceptAppointmentId ? { id: { not: exceptAppointmentId } } : {}),
    },
    select: { id: true },
  });
  return cita ? 'Ese profesional ya tiene otra cita en ese horario' : null;
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
