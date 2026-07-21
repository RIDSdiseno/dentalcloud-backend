import bcrypt from 'bcrypt';
import type { Request, Response } from 'express';
import type { CookieOptions } from 'express';
import type { User, Clinica } from '@prisma/client';
import prisma from '../lib/prisma';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/tokens';
import { parseClinicaModules } from '../lib/clinicaModules';

const REFRESH_COOKIE_NAME = 'refreshToken';

function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };
}

function toPublicUser(user: User & { clinica?: Clinica | null }) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    clinicaId: user.clinicaId,
    clinicaModules: user.clinica ? parseClinicaModules(user.clinica.modules) : null,
    rxEnabled: user.clinica ? user.clinica.rxEnabled : null,
  };
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son requeridos' });
  }

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, include: { clinica: true } });
  if (!user) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  if (user.clinica && !user.clinica.active) {
    return res.status(403).json({ error: 'Tu clínica está desactivada. Contacta al administrador de la plataforma.' });
  }

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
  return res.json({ accessToken, user: toPublicUser(user) });
}

export async function refresh(req: Request, res: Response) {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: 'No hay sesión activa' });
  }

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    return res.status(401).json({ error: 'Sesión expirada, vuelve a iniciar sesión' });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub }, include: { clinica: true } });
  if (!user) {
    return res.status(401).json({ error: 'Sesión inválida' });
  }
  if (user.clinica && !user.clinica.active) {
    return res.status(403).json({ error: 'Tu clínica está desactivada. Contacta al administrador de la plataforma.' });
  }

  const accessToken = signAccessToken(user);
  const newRefreshToken = signRefreshToken(user);
  res.cookie(REFRESH_COOKIE_NAME, newRefreshToken, refreshCookieOptions());
  return res.json({ accessToken, user: toPublicUser(user) });
}

export function logout(req: Request, res: Response) {
  const { maxAge, ...clearOptions } = refreshCookieOptions();
  res.clearCookie(REFRESH_COOKIE_NAME, clearOptions);
  return res.status(204).send();
}

export async function me(req: Request, res: Response) {
  const user = await prisma.user.findUnique({ where: { id: req.user!.sub }, include: { clinica: true } });
  if (!user) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }
  return res.json({ user: toPublicUser(user) });
}
