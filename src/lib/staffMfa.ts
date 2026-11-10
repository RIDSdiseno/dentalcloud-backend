import crypto from 'node:crypto';
import type { Request, Response, CookieOptions } from 'express';

// Doble verificación del PERSONAL (10-11-2026), igual que el portal del
// paciente: después de la contraseña llega un código de 6 dígitos al correo.
//
// - Se prende con STAFF_MFA_ENABLED=true en Railway. Apagada (o sin la
//   variable) el login funciona como siempre. Es también la vía de emergencia:
//   si el correo falla y nadie puede entrar, se apaga desde Railway sin código.
// - Los códigos pendientes viven en la memoria del servidor (no se toca la base):
//   duran 10 minutos, máx. 5 intentos, se guardan cifrados (hash). Si el
//   servidor se reinicia, basta con pedir un código nuevo.
// - "Recordar este computador 30 días": cookie firmada, ligada a la persona y a
//   su contraseña actual (si cambia la contraseña, el equipo deja de recordarse).

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_WAIT_MS = 30 * 1000;
const TRUST_DAYS = 30;
export const TRUST_COOKIE = 'staffTrustedDevice';

export function isStaffMfaEnabled() {
  return process.env.STAFF_MFA_ENABLED === 'true';
}

function secret() {
  return crypto.createHmac('sha256', process.env.JWT_REFRESH_SECRET ?? '').update('fordentcloud:staff-mfa:v1').digest();
}
function hashCode(challengeId: string, code: string) {
  return crypto.createHmac('sha256', secret()).update(`${challengeId}:${code}`).digest('hex');
}
function safeEqual(a: string, b: string) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

type Challenge = { userId: string; codeHash: string; expiresAt: number; attempts: number; sentAt: number };
const challenges = new Map<string, Challenge>();
function purge() {
  const now = Date.now();
  for (const [k, v] of challenges) if (v.expiresAt < now) challenges.delete(k);
}

function newCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export function createChallenge(userId: string) {
  purge();
  const challengeId = crypto.randomBytes(24).toString('hex');
  const code = newCode();
  challenges.set(challengeId, { userId, codeHash: hashCode(challengeId, code), expiresAt: Date.now() + CODE_TTL_MS, attempts: 0, sentAt: Date.now() });
  return { challengeId, code };
}

export function renewChallenge(challengeId: string): { code: string; userId: string } | { error: string } {
  purge();
  const c = challenges.get(challengeId);
  if (!c) return { error: 'El código expiró. Vuelve a iniciar sesión.' };
  if (Date.now() - c.sentAt < RESEND_WAIT_MS) return { error: 'Espera unos segundos antes de pedir otro código.' };
  const code = newCode();
  challenges.set(challengeId, { ...c, codeHash: hashCode(challengeId, code), expiresAt: Date.now() + CODE_TTL_MS, attempts: 0, sentAt: Date.now() });
  return { code, userId: c.userId };
}

export function verifyChallenge(challengeId: string, code: string): { userId: string } | { error: string } {
  purge();
  const c = challenges.get(challengeId);
  if (!c) return { error: 'El código expiró. Vuelve a iniciar sesión.' };
  if (c.attempts >= MAX_ATTEMPTS) {
    challenges.delete(challengeId);
    return { error: 'Demasiados intentos. Vuelve a iniciar sesión.' };
  }
  c.attempts += 1;
  if (!/^\d{6}$/.test(code) || !safeEqual(hashCode(challengeId, code), c.codeHash)) {
    return { error: 'El código no es correcto.' };
  }
  challenges.delete(challengeId);
  return { userId: c.userId };
}

// ---- "Recordar este computador" -------------------------------------------
function trustSig(userId: string, exp: number, passwordHash: string) {
  return crypto.createHmac('sha256', secret()).update(`${userId}.${exp}.${passwordHash}`).digest('hex');
}

export function trustCookieOptions(): CookieOptions {
  const isProd = process.env.NODE_ENV === 'production';
  return { httpOnly: true, secure: isProd, sameSite: isProd ? 'none' : 'lax', path: '/api/auth', maxAge: TRUST_DAYS * 864e5 };
}

export function setTrustedDevice(res: Response, user: { id: string; passwordHash: string }) {
  const exp = Date.now() + TRUST_DAYS * 864e5;
  res.cookie(TRUST_COOKIE, `${user.id}.${exp}.${trustSig(user.id, exp, user.passwordHash)}`, trustCookieOptions());
}

export function isTrustedDevice(req: Request, user: { id: string; passwordHash: string }) {
  const raw = (req.cookies as Record<string, string> | undefined)?.[TRUST_COOKIE];
  if (!raw) return false;
  const [userId, expTxt, sig] = raw.split('.');
  const exp = Number(expTxt);
  if (userId !== user.id || !Number.isFinite(exp) || exp < Date.now() || !sig) return false;
  return safeEqual(sig, trustSig(user.id, exp, user.passwordHash));
}

export function maskEmail(email: string) {
  const [u, d] = email.split('@');
  if (!d) return email;
  return `${u.slice(0, 2)}${'*'.repeat(Math.max(1, u.length - 2))}@${d}`;
}

export function buildCodeEmailHtml(name: string, code: string) {
  const safe = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c] as string);
  return `<div style="font-family:Arial,sans-serif;color:#0f172a">
  <p>Hola ${safe(name)},</p>
  <p>Tu código para entrar a fordentcloud es:</p>
  <p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p>
  <p>Vence en 10 minutos. Si no fuiste tú, ignora este correo y cambia tu contraseña.</p>
</div>`;
}
