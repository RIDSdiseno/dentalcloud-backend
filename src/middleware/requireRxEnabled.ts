import type { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';

export async function requireRxEnabled(req: Request, res: Response, next: NextFunction) {
  const clinicaId = req.user?.clinicaId;
  if (!clinicaId) {
    return res.status(403).json({ error: 'Tu cuenta no pertenece a ninguna clínica' });
  }

  const clinica = await prisma.clinica.findUnique({ where: { id: clinicaId }, select: { rxEnabled: true } });
  if (!clinica?.rxEnabled) {
    return res.status(403).json({ error: 'El módulo Rx no está habilitado para tu clínica' });
  }

  return next();
}
