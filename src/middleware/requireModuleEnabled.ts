import type { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { CLINICA_MODULE_LABELS, parseClinicaModules, type ClinicaModuleKey } from '../lib/clinicaModules';

export function requireModuleEnabled(moduleKey: ClinicaModuleKey) {
  return async function (req: Request, res: Response, next: NextFunction) {
    const clinicaId = req.user?.clinicaId;
    if (!clinicaId) {
      return res.status(403).json({ error: 'Tu cuenta no pertenece a ninguna clínica' });
    }

    const clinica = await prisma.clinica.findUnique({ where: { id: clinicaId }, select: { modules: true } });
    const modules = parseClinicaModules(clinica?.modules);
    if (!modules[moduleKey]) {
      return res.status(403).json({
        error: `El módulo "${CLINICA_MODULE_LABELS[moduleKey]}" no está habilitado para tu clínica`,
      });
    }

    return next();
  };
}
