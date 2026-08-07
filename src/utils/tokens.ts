import jwt, { type SignOptions } from 'jsonwebtoken';
import type { User } from '@prisma/client';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
  clinicaId: string | null;
}

export interface RefreshTokenPayload {
  sub: string;
}

export function signAccessToken(user: User) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, clinicaId: user.clinicaId },
    process.env.JWT_ACCESS_SECRET as string,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN } as SignOptions
  );
}

export function signRefreshToken(user: User) {
  return jwt.sign({ sub: user.id }, process.env.JWT_REFRESH_SECRET as string, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET as string) as AccessTokenPayload;
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
export function signDicomViewerToken(orderId: number | string) {
  return jwt.sign({ orderId: String(orderId) }, process.env.JWT_ACCESS_SECRET as string, {
    expiresIn: '2h',
  } as SignOptions);
}

export function verifyDicomViewerToken(token: string): DicomViewerTokenPayload {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET as string) as DicomViewerTokenPayload;
}
