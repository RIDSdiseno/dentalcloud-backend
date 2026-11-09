import type { Request } from 'express';
import prisma from './prisma';
import { fetchOrderById } from './dimageClient';
import { isValidRut, rutEquivalents } from '../utils/rut';

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

// Si la orden está en la tabla, exige que sea de la clínica de quien pregunta
// (o super_admin). Si NO está (órdenes anteriores a la tabla), ya no deja
// pasar a cualquiera (09-11-2026): se pide la orden a RIDS RX y solo se
// permite si el RUT del paciente de la orden es paciente de esta clínica.
// Si ese RUT existe en una sola clínica, se guarda el mapeo para la próxima.
export async function isOrderAccessAllowed(orderId: string, req: Request): Promise<boolean> {
  if (req.user!.role === 'super_admin') return true;
  const clinicaId = req.user!.clinicaId;
  if (!clinicaId) return false;
  const mapping = await prisma.rxOrderClinic.findUnique({ where: { dimageOrderId: String(orderId) } });
  if (mapping) return mapping.clinicaId === clinicaId;

  let rutPaciente: string | undefined;
  try {
    const order = await fetchOrderById(orderId);
    rutPaciente = typeof order?.rut_paciente === 'string' ? order.rut_paciente : undefined;
  } catch {
    return false;
  }
  if (!rutPaciente || !isValidRut(rutPaciente)) return false;

  const pacientes = await prisma.patient.findMany({
    where: { rut: { in: rutEquivalents(rutPaciente) } },
    select: { id: true, clinicaId: true },
  });
  const propio = pacientes.find((p) => p.clinicaId === clinicaId);
  if (!propio) return false;
  if (new Set(pacientes.map((p) => p.clinicaId)).size === 1) {
    await recordRxOrderClinic(orderId, clinicaId, propio.id);
  }
  return true;
}
