import crypto from 'crypto';
import bcrypt from 'bcrypt';
import type { Request, Response } from 'express';
import prisma from '../lib/prisma';
import cloudinary from '../lib/cloudinary';
import { cleanRut, isValidRut } from '../utils/rut';
import { syncProfessionalToDimageIfNeeded } from '../lib/dimageProfessionalSync';
import { isDimageConfigured, fetchOdontologosByHolding, fetchRadiologosByHolding } from '../lib/dimageClient';
import { parseClinicaModules } from '../lib/clinicaModules';
import { isPermissionedRole, parseRolePermissions, PERMISSION_KEYS, type PermissionKey } from '../lib/rolePermissions';
import {
  CLINICA_MODULE_KEYS,
  parsePermissionOverrides,
  parseModuleOverrides,
  mergePermissionOverrides,
  mergeModuleOverrides,
} from '../lib/userAccessOverrides';
import type { ClinicaModuleKey } from '../lib/clinicaModules';
import { syncUserToFederation } from '../lib/federationSync';

const DIMAGE_SYNCED_ROLES = ['odontologo', 'radiologo'];

function isPngDataUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:image/png;base64,') && value.length > 'data:image/png;base64,'.length;
}

// Firma dibujada por el propio profesional (canvas) al crear su cuenta —
// mismo patrón que la firma de consentimientos: se manda como data URL y se
// sube directo a Cloudinary. Es opcional: si falla la subida, no bloquea la
// creación del profesional, solo queda sin firma (se puede agregar después).
async function uploadUserSignature(
  dataUrl: string,
  clinicaId: string,
  userId: string
): Promise<{ url: string; publicId: string } | null> {
  try {
    const result = await cloudinary.uploader.upload(dataUrl, {
      resource_type: 'image',
      folder: `dentalcloud/${clinicaId}/firmas-profesionales`,
      public_id: userId,
      overwrite: true,
    });
    return { url: result.secure_url, publicId: result.public_id };
  } catch (err) {
    console.error('No se pudo subir la firma del profesional', err);
    return null;
  }
}

async function tryDimageSync(user: { rut: string | null; name: string; email: string; role: string; clinicaId: string | null }) {
  if (!user.rut || !DIMAGE_SYNCED_ROLES.includes(user.role) || !user.clinicaId) {
    return { dimageGeneratedPassword: null, dimageSyncError: null };
  }
  const clinica = await prisma.clinica.findUnique({ where: { id: user.clinicaId }, select: { rxEnabled: true } });
  if (!clinica?.rxEnabled) {
    return { dimageGeneratedPassword: null, dimageSyncError: null };
  }
  try {
    const sucursal = await prisma.sucursal.findFirst({
      where: { clinicaId: user.clinicaId, dimageClinicId: { not: null } },
      select: { dimageClinicId: true },
    });
    const { generatedPassword } = await syncProfessionalToDimageIfNeeded({
      ...user,
      dimageClinicId: sucursal?.dimageClinicId,
    });
    return { dimageGeneratedPassword: generatedPassword, dimageSyncError: null };
  } catch (err) {
    console.error('No se pudo sincronizar el profesional con RIDS RX', err);
    return { dimageGeneratedPassword: null, dimageSyncError: 'No se pudo sincronizar con RIDS RX. Intenta más tarde.' };
  }
}

export const VALID_ROLES = ['admin', 'odontologo', 'radiologo', 'operador'];

function toPublicUser(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  rut: string | null;
  createdAt: Date;
  clinicaId: string | null;
  signatureUrl?: string | null;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    rut: user.rut,
    createdAt: user.createdAt,
    clinicaId: user.clinicaId,
    signatureUrl: user.signatureUrl ?? null,
  };
}

export async function list(req: Request, res: Response) {
  const users = await prisma.user.findMany({
    where: { clinicaId: req.user!.clinicaId! },
    select: { id: true, email: true, name: true, role: true, rut: true, createdAt: true, clinicaId: true, signatureUrl: true },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  });
  return res.json({ users });
}

export async function create(req: Request, res: Response) {
  const { name, email, password, role, rut, signatureDataUrl } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    role?: string;
    rut?: string;
    signatureDataUrl?: string;
  };

  if (!name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  }
  if (!role || !VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `El rol debe ser uno de: ${VALID_ROLES.join(', ')}` });
  }
  if (rut?.trim() && !isValidRut(rut)) {
    return res.status(400).json({ error: 'El RUT ingresado no es válido' });
  }
  if (signatureDataUrl && !isPngDataUrl(signatureDataUrl)) {
    return res.status(400).json({ error: 'La firma debe ser una imagen PNG válida' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return res.status(409).json({ error: `Ya existe un usuario con el email ${normalizedEmail}` });
  }

  const clinicaId = req.user!.clinicaId!;
  // Se genera el id de antemano para poder subir la firma (si viene) usando
  // ese mismo id como public_id en Cloudinary, y guardar ambas cosas juntas
  // en un solo create — igual que el patrón ya usado en dataConsentsController.
  const userId = crypto.randomUUID();
  const signature = signatureDataUrl ? await uploadUserSignature(signatureDataUrl, clinicaId, userId) : null;

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      id: userId,
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      role,
      rut: rut?.trim() ? cleanRut(rut) : null,
      clinicaId,
      ...(signature ? { signatureUrl: signature.url, signaturePublicId: signature.publicId } : {}),
    },
  });

  const { dimageGeneratedPassword, dimageSyncError } = await tryDimageSync(user);

  syncUserToFederation(user, password).catch((err) => {
    console.error('No se pudo sincronizar el profesional recién creado con Dental-Demo-Back', err);
  });

  return res.status(201).json({ user: toPublicUser(user), dimageGeneratedPassword, dimageSyncError });
}

export async function update(req: Request<{ id: string }>, res: Response) {
  const { rut } = req.body as { rut?: string | null };
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  let cleanedRut: string | null | undefined;
  if (rut !== undefined) {
    if (rut === null || rut.trim() === '') {
      cleanedRut = null;
    } else {
      if (!isValidRut(rut)) {
        return res.status(400).json({ error: 'El RUT ingresado no es válido' });
      }
      cleanedRut = cleanRut(rut);
    }
  }

  const updated = await prisma.user.update({
    where: { id: req.params.id },
    data: { ...(cleanedRut !== undefined ? { rut: cleanedRut } : {}) },
  });

  const gainedRut = !user.rut && cleanedRut;
  const { dimageGeneratedPassword, dimageSyncError } = gainedRut
    ? await tryDimageSync(updated)
    : { dimageGeneratedPassword: null, dimageSyncError: null };

  return res.json({ user: toPublicUser(updated), dimageGeneratedPassword, dimageSyncError });
}

type DimageStaffRow = { rut: string; name: string; email: string };

// Trae odontólogos/radiólogos que ya existen en RIDS RX pero todavía no en
// fordentcloud (RIDS RX -> fordentcloud). Genera una contraseña local nueva por
// cada uno (no conocemos ni podemos reutilizar la de RIDS RX) y la devuelve una
// única vez para que el admin se la pase a esa persona.
export async function importFromDimage(req: Request, res: Response) {
  const clinicaId = req.user!.clinicaId!;
  const clinica = await prisma.clinica.findUnique({ where: { id: clinicaId }, select: { rxEnabled: true } });
  if (!clinica?.rxEnabled) {
    return res.status(403).json({ error: 'El módulo Rx no está habilitado para tu clínica' });
  }
  if (!isDimageConfigured()) {
    return res.status(503).json({ error: 'La integración con RIDS RX no está configurada.' });
  }

  const [odontologos, radiologos] = await Promise.all([
    fetchOdontologosByHolding().catch(() => [] as DimageStaffRow[]),
    fetchRadiologosByHolding().catch(() => [] as DimageStaffRow[]),
  ]);

  const candidates = [
    ...(odontologos as DimageStaffRow[]).map((o) => ({ ...o, role: 'odontologo' })),
    ...(radiologos as DimageStaffRow[]).map((r) => ({ ...r, role: 'radiologo' })),
  ].filter((c) => c.rut && c.email);

  const existingUsers = await prisma.user.findMany({ where: { clinicaId }, select: { rut: true } });
  const existingRuts = new Set(existingUsers.map((u) => u.rut).filter((r): r is string => !!r).map(cleanRut));

  const imported: Array<{ name: string; rut: string; role: string; generatedPassword: string }> = [];

  for (const candidate of candidates) {
    const cleanedRut = cleanRut(candidate.rut);
    if (existingRuts.has(cleanedRut)) continue;

    const normalizedEmail = candidate.email.trim().toLowerCase();
    const existingByEmail = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingByEmail) continue;

    const generatedPassword = crypto.randomBytes(9).toString('base64url');
    const passwordHash = await bcrypt.hash(generatedPassword, 10);

    await prisma.user.create({
      data: {
        name: candidate.name || `${candidate.role === 'radiologo' ? 'Radiólogo' : 'Odontólogo'} ${cleanedRut}`,
        email: normalizedEmail,
        passwordHash,
        role: candidate.role,
        rut: cleanedRut,
        clinicaId,
      },
    });

    existingRuts.add(cleanedRut);
    imported.push({ name: candidate.name, rut: cleanedRut, role: candidate.role, generatedPassword });
  }

  return res.json({ imported });
}

// Trae, para un usuario puntual de la clínica del admin logueado: el default
// de su rol/clínica (`permissionDefaults`/`moduleDefaults`), sus excepciones
// guardadas (`permissionOverrides`/`moduleOverrides`, sólo las llaves que
// difieren del default) y el resultado ya combinado (`effectivePermissions`/
// `effectiveModules`) — para que el panel de permisos individuales no tenga
// que reimplementar el merge que ya hacen `resolvePermissions`/`toPublicUser`.
export async function getPermissions(req: Request<{ id: string }>, res: Response) {
  const targetUser = await prisma.user.findFirst({
    where: { id: req.params.id, clinicaId: req.user!.clinicaId! },
    select: { id: true, role: true, permissionOverrides: true, moduleOverrides: true },
  });
  if (!targetUser) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  const clinica = await prisma.clinica.findUnique({
    where: { id: req.user!.clinicaId! },
    select: { rolePermissions: true, modules: true },
  });

  const allTrue = Object.fromEntries(PERMISSION_KEYS.map((k) => [k, true])) as Record<PermissionKey, boolean>;
  const permissionDefaults = isPermissionedRole(targetUser.role)
    ? parseRolePermissions(clinica?.rolePermissions)[targetUser.role]
    : allTrue;
  const moduleDefaults = parseClinicaModules(clinica?.modules);

  const permissionOverrides = parsePermissionOverrides(targetUser.permissionOverrides);
  const moduleOverrides = parseModuleOverrides(targetUser.moduleOverrides);

  return res.json({
    role: targetUser.role,
    isPermissionedRole: isPermissionedRole(targetUser.role),
    permissionDefaults,
    moduleDefaults,
    permissionOverrides,
    moduleOverrides,
    effectivePermissions: { ...permissionDefaults, ...permissionOverrides },
    effectiveModules: { ...moduleDefaults, ...moduleOverrides },
  });
}

export async function updatePermissions(req: Request<{ id: string }>, res: Response) {
  const { permissionOverrides, moduleOverrides } = req.body as {
    permissionOverrides?: Partial<Record<string, boolean | null>>;
    moduleOverrides?: Partial<Record<string, boolean | null>>;
  };

  const targetUser = await prisma.user.findFirst({
    where: { id: req.params.id, clinicaId: req.user!.clinicaId! },
    select: { id: true, role: true, permissionOverrides: true, moduleOverrides: true },
  });
  if (!targetUser) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  const data: { permissionOverrides?: Record<PermissionKey, boolean>; moduleOverrides?: Record<ClinicaModuleKey, boolean> } = {};

  if (permissionOverrides !== undefined) {
    if (!isPermissionedRole(targetUser.role)) {
      return res.status(400).json({ error: 'Este rol siempre tiene acceso completo; no admite excepciones de permisos' });
    }
    for (const key of Object.keys(permissionOverrides)) {
      if (!(PERMISSION_KEYS as readonly string[]).includes(key)) {
        return res.status(400).json({ error: `Permiso inválido: ${key}` });
      }
    }
    data.permissionOverrides = mergePermissionOverrides(
      targetUser.permissionOverrides,
      permissionOverrides as Partial<Record<PermissionKey, boolean | null>>
    );
  }

  if (moduleOverrides !== undefined) {
    for (const key of Object.keys(moduleOverrides)) {
      if (!(CLINICA_MODULE_KEYS as readonly string[]).includes(key)) {
        return res.status(400).json({ error: `Módulo inválido: ${key}` });
      }
    }
    data.moduleOverrides = mergeModuleOverrides(
      targetUser.moduleOverrides,
      moduleOverrides as Partial<Record<ClinicaModuleKey, boolean | null>>
    );
  }

  const updated = await prisma.user.update({ where: { id: targetUser.id }, data });

  return res.json({
    permissionOverrides: parsePermissionOverrides(updated.permissionOverrides),
    moduleOverrides: parseModuleOverrides(updated.moduleOverrides),
  });
}
