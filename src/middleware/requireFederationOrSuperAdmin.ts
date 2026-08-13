import type { Request, Response, NextFunction } from 'express';
import { authenticate } from './authenticate';
import { requireSuperAdmin } from './requireSuperAdmin';

// Deja pasar llamadas servidor-a-servidor desde Dental-Demo-Back (misma
// credencial que usa este backend para llamar hacia allá, ver federationClient.ts)
// sin exigir un JWT de super-admin humano. Si no viene la API key, exige lo
// mismo que las demás rutas de super-admin (Bearer token + rol super_admin) —
// por eso compone authenticate + requireSuperAdmin en vez de asumirlos ya
// aplicados por el router.
export function requireFederationOrSuperAdmin(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'];
  if (process.env.FEDERATION_API_KEY && apiKey === process.env.FEDERATION_API_KEY) {
    return next();
  }

  return authenticate(req, res, () => requireSuperAdmin(req, res, next));
}
