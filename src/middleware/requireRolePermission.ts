import type { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { isPermissionedRole, parseRolePermissions, PERMISSION_LABELS, type PermissionKey } from '../lib/rolePermissions';
import { applyPermissionOverrides } from '../lib/userAccessOverrides';

// Segundo nivel de control, debajo de `requireModuleEnabled` (que decide si
// la clínica completa tiene el módulo en su plan): dentro de eso, cada
// clínica decide qué perfil (odontólogo/radiólogo/operador) puede usarlo, y
// cada usuario puntual puede tener excepciones sobre el default de su perfil
// (`User.permissionOverrides`). `admin` y `super_admin` siempre tienen acceso
// completo, sin excepciones posibles.
export function requireRolePermission(key: PermissionKey) {
  return async function (req: Request, res: Response, next: NextFunction) {
    const permissions = await resolveRequestPermissions(req);
    if (permissions === 'full-access') return next();
    if (permissions === 'no-clinic') {
      return res.status(403).json({ error: 'Tu cuenta no pertenece a ninguna clínica' });
    }
    if (!permissions[key]) {
      return res.status(403).json({ error: `Tu perfil no tiene acceso a "${PERMISSION_LABELS[key]}"` });
    }

    return next();
  };
}

// Misma resolución que usa el middleware de arriba, pero expuesta para
// controllers que necesitan chequear un permiso puntual DENTRO de un
// endpoint más amplio (ej. bloquear solo el campo `motivoConsulta` de un
// PATCH de paciente, sin bloquear el resto de los campos — ver
// patientsController.ts). `'full-access'` cubre admin/super_admin y
// cualquier rol no controlado por esta matriz (mismo criterio que el
// middleware: no todos los roles pasan por acá).
export async function resolveRequestPermissions(
  req: Request
): Promise<Record<PermissionKey, boolean> | 'full-access' | 'no-clinic'> {
  const role = req.user?.role;
  if (role === 'admin' || role === 'super_admin') return 'full-access';
  if (!role || !isPermissionedRole(role)) return 'full-access';

  const clinicaId = req.user?.clinicaId;
  if (!clinicaId) return 'no-clinic';

  const [clinica, user] = await Promise.all([
    prisma.clinica.findUnique({ where: { id: clinicaId }, select: { rolePermissions: true } }),
    prisma.user.findUnique({ where: { id: req.user!.sub }, select: { permissionOverrides: true } }),
  ]);
  const basePermissions = parseRolePermissions(clinica?.rolePermissions)[role];
  return applyPermissionOverrides(basePermissions, user?.permissionOverrides);
}
