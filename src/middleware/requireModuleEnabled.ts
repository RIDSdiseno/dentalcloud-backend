import type { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { CLINICA_MODULE_LABELS, parseClinicaModules, type ClinicaModuleKey } from '../lib/clinicaModules';
import { applyModuleOverrides } from '../lib/userAccessOverrides';

// Primer nivel de control: la clínica completa debe tener el módulo activo en
// su plan (`Clinica.modules`). Encima de eso, un usuario puntual puede tener
// el módulo bloqueado (o, si la clínica lo tiene apagado, reactivado sólo para
// él) vía `User.moduleOverrides` — a diferencia de `requireRolePermission`,
// esto no distingue por rol, así que aplica incluso a `admin`.
export function requireModuleEnabled(moduleKey: ClinicaModuleKey) {
  return async function (req: Request, res: Response, next: NextFunction) {
    const clinicaId = req.user?.clinicaId;
    if (!clinicaId) {
      return res.status(403).json({ error: 'Tu cuenta no pertenece a ninguna clínica' });
    }

    const [clinica, user] = await Promise.all([
      prisma.clinica.findUnique({ where: { id: clinicaId }, select: { modules: true } }),
      prisma.user.findUnique({ where: { id: req.user!.sub }, select: { moduleOverrides: true } }),
    ]);
    const baseModules = parseClinicaModules(clinica?.modules);
    const modules = applyModuleOverrides(baseModules, user?.moduleOverrides);
    if (!modules[moduleKey]) {
      return res.status(403).json({
        error: `El módulo "${CLINICA_MODULE_LABELS[moduleKey]}" no está habilitado para tu clínica`,
      });
    }

    return next();
  };
}
