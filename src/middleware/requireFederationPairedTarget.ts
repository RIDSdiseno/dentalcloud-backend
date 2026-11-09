import type { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';

// Escrituras desde Dental-Demo solo en clínicas CONECTADAS (09-11-2026).
// Antes, con la clave, se podía escribir en cualquier clínica de este sistema.
// Ahora una llamada firmada desde Dental-Demo solo puede tocar una clínica que
// tenga par allá (Clinica.federatedClinicId). La clínica se deduce de lo que
// trae la llamada: clinicaId, o el paciente, o el presupuesto. Las bajas que
// solo traen externalId apuntan a registros ya espejados (de una clínica
// conectada), así que pasan. No afecta al super admin con su sesión.
async function clinicaIdOf(body: Record<string, unknown>): Promise<string | null> {
  if (typeof body.clinicaId === 'string' && body.clinicaId) return body.clinicaId;
  if (typeof body.patientId === 'string' && body.patientId) {
    return (await prisma.patient.findUnique({ where: { id: body.patientId }, select: { clinicaId: true } }))?.clinicaId ?? null;
  }
  if (typeof body.treatmentPlanId === 'string' && body.treatmentPlanId) {
    return (
      (await prisma.treatmentPlan.findUnique({ where: { id: body.treatmentPlanId }, select: { clinicaId: true } }))?.clinicaId ?? null
    );
  }
  return null;
}

export async function requireFederationPairedTarget(req: Request, res: Response, next: NextFunction) {
  try {
    if (!(req as unknown as { isFederationCall?: boolean }).isFederationCall) return next();
    const clinicaId = await clinicaIdOf((req.body ?? {}) as Record<string, unknown>);
    if (!clinicaId) return next(); // el handler valida (404 si no existe)
    const clinica = await prisma.clinica.findUnique({ where: { id: clinicaId }, select: { federatedClinicId: true } });
    if (clinica && !clinica.federatedClinicId) {
      return res.status(403).json({ error: 'La clínica no está conectada con Dental-Demo' });
    }
    return next();
  } catch (err) {
    return next(err);
  }
}
