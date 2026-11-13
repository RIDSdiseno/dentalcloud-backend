import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { User } from '@prisma/client';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
  clinicaId: string | null;
  active?: boolean;
}

export interface RefreshTokenPayload {
  sub: string;
  // Huella de la contraseña vigente (09-11-2026). Si la contraseña cambia, la
  // huella deja de coincidir y todas las sesiones abiertas de esa persona
  // dejan de renovarse. Tokens anteriores a este cambio no la traen.
  pv?: string;
  // Identificador de ESTA sesión (13-11-2026). Al cerrar sesión se anota en
  // revoked_refresh_tokens y el token deja de servir aunque no haya vencido.
  jti?: string;
  exp?: number;
}

export function passwordFingerprint(user: Pick<User, 'passwordHash'>) {
  return crypto
    .createHmac('sha256', process.env.JWT_REFRESH_SECRET as string)
    .update(user.passwordHash)
    .digest('hex')
    .slice(0, 16);
}

export function refreshTokenMatchesUser(payload: RefreshTokenPayload, user: Pick<User, 'passwordHash'>) {
  return payload.pv === undefined || payload.pv === passwordFingerprint(user);
}

export function signAccessToken(user: User) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, clinicaId: user.clinicaId, active: user.active },
    process.env.JWT_ACCESS_SECRET as string,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN } as SignOptions
  );
}

// `sessionId` se mantiene en cada renovación (refresh) para que, al cerrar
// sesión, queden inválidas también las copias anteriores de esa misma sesión.
export function signRefreshToken(user: User, sessionId: string = crypto.randomUUID()) {
  return jwt.sign({ sub: user.id, pv: passwordFingerprint(user), jti: sessionId }, process.env.JWT_REFRESH_SECRET as string, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
  } as SignOptions);
}

// Un token de SESIÓN siempre trae usuario (sub) y rol. Cualquier otro token
// firmado (por ejemplo uno antiguo del visor DICOM, que solo traía orderId) se
// rechaza: sin rol, los permisos lo trataban como "acceso total" y, sin
// clínica, veía datos de todas las clínicas.
export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET as string) as Partial<AccessTokenPayload> & {
    typ?: string;
  };
  if (typeof payload.sub !== 'string' || !payload.sub || typeof payload.role !== 'string' || !payload.role || payload.typ) {
    throw new Error('El token no es de sesión');
  }
  return payload as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET as string) as RefreshTokenPayload;
}

export interface DicomViewerTokenPayload {
  orderId: string;
}

// El visor 3D (Med3Web) corre en una pestaña/ventana aparte y pide los
// archivos con XHR planas — no lleva el header Authorization del cliente
// autenticado. Este token de corta duración, embebido en la URL, es lo que
// autoriza esas solicitudes en su lugar.
//
// Seguridad: se firma con una clave PROPIA del visor (derivada de
// JWT_ACCESS_SECRET, así no hace falta una variable nueva en Railway) y con
// audiencia "dicom-viewer". Así este token solo sirve para ver los archivos de
// SU orden y nunca como sesión, y un token de sesión no sirve en el visor.
const DICOM_AUDIENCE = 'dicom-viewer';
function dicomViewerSecret() {
  return crypto
    .createHmac('sha256', process.env.JWT_ACCESS_SECRET as string)
    .update('fordentcloud:dicom-viewer-token:v1')
    .digest('hex');
}

export function signDicomViewerToken(orderId: number | string) {
  return jwt.sign({ orderId: String(orderId), typ: DICOM_AUDIENCE }, dicomViewerSecret(), {
    expiresIn: '2h',
    audience: DICOM_AUDIENCE,
  } as SignOptions);
}

export function verifyDicomViewerToken(token: string): DicomViewerTokenPayload {
  const payload = jwt.verify(token, dicomViewerSecret(), { audience: DICOM_AUDIENCE }) as Partial<DicomViewerTokenPayload>;
  if (typeof payload.orderId !== 'string' || !payload.orderId) {
    throw new Error('Token del visor sin orden');
  }
  return payload as DicomViewerTokenPayload;
}
