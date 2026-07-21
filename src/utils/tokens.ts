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
