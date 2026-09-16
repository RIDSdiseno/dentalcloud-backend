import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/tokens';

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token no provisto' });
  }

  const token = header.slice('Bearer '.length);
  try {
    req.user = verifyAccessToken(token);
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }

  // Baja de profesional (softlimit): un profesional inactivo sigue pudiendo
  // consultar su propio historial (GET), pero no crear ni modificar nada.
  // `active` viene embebido en el token (se refresca solo cada 15 min, ver
  // JWT_ACCESS_EXPIRES_IN); `undefined` (tokens emitidos antes de este campo)
  // se trata como activo, para no cerrarle la sesión a nadie de golpe.
  const isSafeMethod = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';
  if (!isSafeMethod && req.user.active === false) {
    return res.status(403).json({ error: 'Tu cuenta está inactiva: solo puedes consultar información, no crear ni modificar nada.' });
  }

  return next();
}
