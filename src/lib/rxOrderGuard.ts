import type { Request } from 'express';
import prisma from './prisma';

// Auditoría de seguridad (16/09) — ver el comentario en RxOrderClinic
// (schema.prisma) para el porqué de esta tabla. Guarda el mapeo apenas se
// crea una orden nueva; best-effort, nunca debe tumbar la creación real de
// la orden en Dimage si esto falla.
export async function recordRxOrderClinic(dimageOrderId: string | number, clinicaId: string, patientId?: string) {
  await prisma.rxOrderClinic
    .upsert({
      where: { dimageOrderId: String(dimageOrderId) },
      create: { dimageOrderId: String(dimageOrderId), clinicaId, patientId },
      update: {},
    })
    .catch((err) => {
      console.error('No se pudo registrar el mapeo orden Rx → clínica', err);
    });
}

// Si el id de orden no aparece en la tabla (backfill incompleto, orden
// borrada del lado de Dimage, etc.) deja pasar — nunca rompe acceso a algo
// que ya funcionaba solo por un mapeo faltante. Si SÍ aparece, exige que
// pertenezca a la clínica de quien pregunta (o que sea super_admin).
export async function isOrderAccessAllowed(orderId: string, req: Request): Promise<boolean> {
  if (req.user!.role === 'super_admin') return true;
  const mapping = await prisma.rxOrderClinic.findUnique({ where: { dimageOrderId: String(orderId) } });
  if (!mapping) return true;
  return mapping.clinicaId === req.user!.clinicaId;
}
