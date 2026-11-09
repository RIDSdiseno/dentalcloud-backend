import type { Request, Response, NextFunction } from 'express';

// Acciones del asistente sin duplicados (09-11-2026): cada tarjeta confirmada
// trae una `idempotencyKey`. Si la misma tarjeta llega dos veces (doble clic,
// reintento por red lenta), la segunda NO vuelve a ejecutar: devuelve la misma
// respuesta de la primera. Se guarda en memoria 15 minutos por usuario.
// Sin clave (front antiguo) se ejecuta como siempre.
const TTL_MS = 15 * 60 * 1000;
type Entry = { at: number; status: number; body: unknown } | { at: number; pending: Promise<void> };
const store = new Map<string, Entry>();

function purge(now: number) {
  for (const [k, v] of store) if (now - v.at > TTL_MS) store.delete(k);
}

export async function assistantIdempotency(req: Request, res: Response, next: NextFunction) {
  const raw = (req.body as { idempotencyKey?: unknown } | undefined)?.idempotencyKey;
  if (typeof raw !== 'string' || !raw || raw.length > 100 || !req.user?.sub) return next();
  const key = `${req.user.sub}:${raw}`;
  const now = Date.now();
  purge(now);

  const prev = store.get(key);
  if (prev && 'pending' in prev) await prev.pending;
  const done = store.get(key);
  if (done && 'body' in done) return res.status(done.status).json(done.body);

  let release!: () => void;
  store.set(key, { at: now, pending: new Promise<void>((r) => (release = r)) });
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    if (res.statusCode < 500) store.set(key, { at: Date.now(), status: res.statusCode, body });
    else store.delete(key);
    release();
    return originalJson(body);
  };
  res.on('close', () => {
    const e = store.get(key);
    if (e && 'pending' in e) {
      store.delete(key);
      release();
    }
  });
  return next();
}

// Registro de lo que ejecuta el asistente (09-11-2026): quién, en qué clínica,
// qué acción y si se hizo. Va a los logs del servidor (Railway); sin nombres,
// RUT ni contenido del paciente.
export function assistantAudit(req: Request, res: Response, next: NextFunction) {
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    const b = (body ?? {}) as { ejecutado?: unknown };
    console.info(
      '[assistant.audit]',
      JSON.stringify({
        at: new Date().toISOString(),
        userId: req.user?.sub,
        role: req.user?.role,
        clinicaId: req.user?.clinicaId,
        tipo: (req.body as { tipo?: unknown } | undefined)?.tipo,
        ejecutado: b.ejecutado === true,
        status: res.statusCode,
      })
    );
    return originalJson(body);
  };
  next();
}
