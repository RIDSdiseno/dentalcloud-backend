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

const VALID_SLOT_DURATIONS = [15, 30, 60];

export async function updateAgendaSettings(req: Request, res: Response) {
  const { slotDurationMinutes } = req.body as { slotDurationMinutes?: number };
  if (!VALID_SLOT_DURATIONS.includes(slotDurationMinutes as number)) {
    return res
      .status(400)
      .json({ error: `slotDurationMinutes debe ser uno de: ${VALID_SLOT_DURATIONS.join(', ')}` });
  }

  const clinica = await prisma.clinica.update({
    where: { id: req.user!.clinicaId! },
    data: { slotDurationMinutes },
  });

  return res.json({ slotDurationMinutes: clinica.slotDurationMinutes });
}

export async function getPaymentGateSettings(req: Request, res: Response) {
  const clinica = await prisma.clinica.findUnique({
    where: { id: req.user!.clinicaId! },
    select: { paymentGateEnabled: true, paymentGateMinPercent: true },
  });
  return res.json({
    paymentGateEnabled: clinica?.paymentGateEnabled ?? false,
    paymentGateMinPercent: clinica?.paymentGateMinPercent ?? 0,
  });
}

export async function updatePaymentGateSettings(req: Request, res: Response) {
  const { paymentGateEnabled, paymentGateMinPercent } = req.body as {
    paymentGateEnabled?: boolean;
    paymentGateMinPercent?: number;
  };
  if (paymentGateMinPercent !== undefined && (paymentGateMinPercent < 0 || paymentGateMinPercent > 100)) {
    return res.status(400).json({ error: 'paymentGateMinPercent debe estar entre 0 y 100' });
  }

  const clinica = await prisma.clinica.update({
    where: { id: req.user!.clinicaId! },
    data: {
      ...(paymentGateEnabled !== undefined ? { paymentGateEnabled } : {}),
      ...(paymentGateMinPercent !== undefined ? { paymentGateMinPercent: Math.round(paymentGateMinPercent) } : {}),
    },
    select: { paymentGateEnabled: true, paymentGateMinPercent: true },
  });

  return res.json(clinica);
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
