import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from './authenticate';
import { requireSuperAdmin } from './requireSuperAdmin';

// Comparación a prueba de timing: un `===` normal corta apenas encuentra la
// primera diferencia, así que el tiempo de respuesta varía según cuántos
// caracteres acertó el atacante — se compara el hash (largo fijo) en vez del
// valor crudo para no exponer eso, y para no tener que lidiar con el caso en
// que ambos strings midan distinto (timingSafeEqual exige el mismo largo).
function safeEqual(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

// Deja pasar llamadas servidor-a-servidor desde Dental-Demo-Back (misma
// credencial que usa este backend para llamar hacia allá, ver federationClient.ts)
// sin exigir un JWT de super-admin humano. Si no viene la API key, exige lo
// mismo que las demás rutas de super-admin (Bearer token + rol super_admin) —
// por eso compone authenticate + requireSuperAdmin en vez de asumirlos ya
// aplicados por el router.
export function requireFederationOrSuperAdmin(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'];
  if (process.env.FEDERATION_API_KEY && typeof apiKey === 'string' && safeEqual(apiKey, process.env.FEDERATION_API_KEY)) {
    return next();
  }

  return authenticate(req, res, () => requireSuperAdmin(req, res, next));
}
