import type { Request, Response } from 'express';
import prisma from '../lib/prisma';
import {
  isPermissionedRole,
  parseRolePermissions,
  PERMISSION_KEYS,
  type PermissionKey,
  type RolePermissions,
} from '../lib/rolePermissions';

export async function getRolePermissions(req: Request, res: Response) {
  const clinica = await prisma.clinica.findUnique({
    where: { id: req.user!.clinicaId! },
    select: { rolePermissions: true },
  });
  return res.json({ rolePermissions: parseRolePermissions(clinica?.rolePermissions) });
}

export async function updateRolePermissions(req: Request, res: Response) {
  const patch = req.body as Partial<Record<string, Partial<Record<string, boolean>>>>;

  for (const role of Object.keys(patch)) {
    if (!isPermissionedRole(role)) {
      return res.status(400).json({ error: `Perfil inválido: ${role}` });
    }
    for (const key of Object.keys(patch[role] ?? {})) {
      if (!(PERMISSION_KEYS as readonly string[]).includes(key)) {
        return res.status(400).json({ error: `Módulo inválido: ${key}` });
      }
    }
  }

  const clinica = await prisma.clinica.findUnique({
    where: { id: req.user!.clinicaId! },
    select: { rolePermissions: true },
  });
  const current = parseRolePermissions(clinica?.rolePermissions);

  const merged: RolePermissions = { ...current };
  for (const role of Object.keys(patch) as (keyof RolePermissions)[]) {
    merged[role] = { ...current[role], ...(patch[role] as Partial<Record<PermissionKey, boolean>>) };
  }

  await prisma.clinica.update({
    where: { id: req.user!.clinicaId! },
    data: { rolePermissions: merged },
  });

  return res.json({ rolePermissions: merged });
}
