import type { Request, Response, NextFunction } from 'express';

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Solo un administrador de la plataforma puede realizar esta acción' });
  }
  return next();
}
