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
    return next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}
