import type { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { isPermissionedRole, parseRolePermissions, PERMISSION_LABELS, type PermissionKey } from '../lib/rolePermissions';

// Segundo nivel de control, debajo de `requireModuleEnabled` (que decide si
// la clínica completa tiene el módulo en su plan): dentro de eso, cada
// clínica decide qué perfil (odontólogo/radiólogo/operador) puede usarlo.
// `admin` y `super_admin` siempre tienen acceso completo.
export function requireRolePermission(key: PermissionKey) {
  return async function (req: Request, res: Response, next: NextFunction) {
    const role = req.user?.role;
    if (role === 'admin' || role === 'super_admin') return next();
    if (!role || !isPermissionedRole(role)) return next();

    const clinicaId = req.user?.clinicaId;
    if (!clinicaId) {
      return res.status(403).json({ error: 'Tu cuenta no pertenece a ninguna clínica' });
    }

    const clinica = await prisma.clinica.findUnique({ where: { id: clinicaId }, select: { rolePermissions: true } });
    const permissions = parseRolePermissions(clinica?.rolePermissions);
    if (!permissions[role][key]) {
      return res.status(403).json({ error: `Tu perfil no tiene acceso a "${PERMISSION_LABELS[key]}"` });
    }

    return next();
  };
}
