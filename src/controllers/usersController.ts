import crypto from 'crypto';
import bcrypt from 'bcrypt';
import type { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { cleanRut, isValidRut } from '../utils/rut';
import { syncProfessionalToDimageIfNeeded } from '../lib/dimageProfessionalSync';
import { isDimageConfigured, fetchOdontologosByHolding, fetchRadiologosByHolding } from '../lib/dimageClient';

const DIMAGE_SYNCED_ROLES = ['odontologo', 'radiologo'];

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

const VALID_ROLES = ['admin', 'odontologo', 'radiologo', 'operador'];

function toPublicUser(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  rut: string | null;
  createdAt: Date;
  clinicaId: string | null;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    rut: user.rut,
    createdAt: user.createdAt,
    clinicaId: user.clinicaId,
  };
}

export async function list(req: Request, res: Response) {
  const users = await prisma.user.findMany({
    where: { clinicaId: req.user!.clinicaId! },
    select: { id: true, email: true, name: true, role: true, rut: true, createdAt: true, clinicaId: true },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  });
  return res.json({ users });
}

export async function create(req: Request, res: Response) {
  const { name, email, password, role, rut } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    role?: string;
    rut?: string;
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

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return res.status(409).json({ error: `Ya existe un usuario con el email ${normalizedEmail}` });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      role,
      rut: rut?.trim() ? cleanRut(rut) : null,
      clinicaId: req.user!.clinicaId!,
    },
  });

  const { dimageGeneratedPassword, dimageSyncError } = await tryDimageSync(user);
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
