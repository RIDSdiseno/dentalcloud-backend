import bcrypt from 'bcrypt';
import type { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { cleanRut, isValidRut } from '../utils/rut';

const VALID_ROLES = ['admin', 'odontologo'];

function toPublicUser(user: { id: string; email: string; name: string; role: string; rut: string | null; createdAt: Date }) {
  return { id: user.id, email: user.email, name: user.name, role: user.role, rut: user.rut, createdAt: user.createdAt };
}

export async function list(req: Request, res: Response) {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, rut: true, createdAt: true },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  });
  return res.json({ users });
}

export async function create(req: Request, res: Response) {
  const { name, email, password, role } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    role?: string;
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

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return res.status(409).json({ error: `Ya existe un usuario con el email ${normalizedEmail}` });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name: name.trim(), email: normalizedEmail, passwordHash, role },
  });
  return res.status(201).json({ user: toPublicUser(user) });
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
  return res.json({ user: toPublicUser(updated) });
}
