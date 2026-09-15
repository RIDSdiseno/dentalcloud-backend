import type { Request, Response } from 'express';
import prisma from '../lib/prisma';
import cloudinary from '../lib/cloudinary';
import {
  isPermissionedRole,
  parseRolePermissions,
  PERMISSION_KEYS,
  type PermissionKey,
  type RolePermissions,
} from '../lib/rolePermissions';

// "Compañía" en Configuración (15/09, Lámina 8 de la reunión con Urbina) —
// de solo la propia clínica del que pide (nunca otra), a diferencia de
// clinicasController.update/updateLogo que son solo para Super Admin.
const COMPANY_SELECT = {
  name: true,
  rut: true,
  pais: true,
  logoUrl: true,
  address: true,
  email: true,
  phone: true,
  website: true,
  legalName: true,
  legalAddress: true,
  legalEmail: true,
  legalPhone: true,
  legalWebsite: true,
  contactName: true,
  contactEmail: true,
  contactPhone: true,
  contactAddress: true,
} as const;

export async function getCompanyInfo(req: Request, res: Response) {
  const clinica = await prisma.clinica.findUnique({
    where: { id: req.user!.clinicaId! },
    select: COMPANY_SELECT,
  });
  if (!clinica) return res.status(404).json({ error: 'Clínica no encontrada' });
  return res.json({ company: clinica });
}

export async function updateCompanyInfo(req: Request, res: Response) {
  const body = req.body as {
    name?: string;
    rut?: string;
    pais?: string;
    address?: string;
    email?: string;
    phone?: string;
    website?: string;
    legalName?: string;
    legalAddress?: string;
    legalEmail?: string;
    legalPhone?: string;
    legalWebsite?: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    contactAddress?: string;
  };
  if (body.name !== undefined && !body.name.trim()) {
    return res.status(400).json({ error: 'El nombre de la clínica es requerido' });
  }
  const updated = await prisma.clinica.update({
    where: { id: req.user!.clinicaId! },
    data: {
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.rut !== undefined ? { rut: body.rut.trim() || null } : {}),
      ...(body.pais !== undefined ? { pais: body.pais.trim() || 'Chile' } : {}),
      ...(body.address !== undefined ? { address: body.address.trim() || null } : {}),
      ...(body.email !== undefined ? { email: body.email.trim() || null } : {}),
      ...(body.phone !== undefined ? { phone: body.phone.trim() || null } : {}),
      ...(body.website !== undefined ? { website: body.website.trim() || null } : {}),
      ...(body.legalName !== undefined ? { legalName: body.legalName.trim() || null } : {}),
      ...(body.legalAddress !== undefined ? { legalAddress: body.legalAddress.trim() || null } : {}),
      ...(body.legalEmail !== undefined ? { legalEmail: body.legalEmail.trim() || null } : {}),
      ...(body.legalPhone !== undefined ? { legalPhone: body.legalPhone.trim() || null } : {}),
      ...(body.legalWebsite !== undefined ? { legalWebsite: body.legalWebsite.trim() || null } : {}),
      ...(body.contactName !== undefined ? { contactName: body.contactName.trim() || null } : {}),
      ...(body.contactEmail !== undefined ? { contactEmail: body.contactEmail.trim() || null } : {}),
      ...(body.contactPhone !== undefined ? { contactPhone: body.contactPhone.trim() || null } : {}),
      ...(body.contactAddress !== undefined ? { contactAddress: body.contactAddress.trim() || null } : {}),
    },
    select: COMPANY_SELECT,
  });
  return res.json({ company: updated });
}

export async function updateMyLogo(req: Request, res: Response) {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'Se requiere un archivo de logo' });
  }
  const clinicaId = req.user!.clinicaId!;
  const clinica = await prisma.clinica.findUnique({ where: { id: clinicaId } });
  if (!clinica) return res.status(404).json({ error: 'Clínica no encontrada' });

  const logo = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: 'image', folder: 'dentalcloud/clinicas/logos' },
      (error, result) => {
        if (error || !result) return reject(error);
        resolve({ secure_url: result.secure_url, public_id: result.public_id });
      }
    );
    stream.end(file.buffer);
  });

  if (clinica.logoPublicId) {
    await cloudinary.uploader.destroy(clinica.logoPublicId).catch(() => {
      // Best-effort: si el logo anterior ya no existe en Cloudinary o falla
      // el borrado, no bloquea la actualización del nuevo logo.
    });
  }

  const updated = await prisma.clinica.update({
    where: { id: clinicaId },
    data: { logoUrl: logo.secure_url, logoPublicId: logo.public_id },
    select: COMPANY_SELECT,
  });
  return res.json({ company: updated });
}

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
